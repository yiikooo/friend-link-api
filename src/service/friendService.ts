import { MongoClient, ObjectId } from "mongodb";
import { Octokit } from "@octokit/core";
import { sendNotifyMail } from "./mailService.js";

// 定义友链申请的数据结构接口
export interface FriendApply {
  _id?: ObjectId;
  name: string;
  link: string;
  avatarLink: string;
  descr: string;
  email: string;
  state: string;
  createdAt?: Date;
  updatedAt?: Date;
  rejectReason?: string;
  // 用于友链更新申请，存储原始友链链接
  originalLink?: string;
}

// ============ 请修改以下配置 ============
// MongoDB 连接字符串，格式: mongodb+srv://<用户名>:<密码>@<集群地址>/?appName=<应用名>
const uri = process.env.MONGODB_URI || "your-mongodb-connection-string";
const dbName = "api";
const collectionName = "friend-apply";

// GitHub 配置
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "your-github-token";
// GITHUB_REPO 格式: owner/repo
const [GITHUB_OWNER, GITHUB_REPO] = (
  process.env.GITHUB_REPO || "your-github-username/your-blog-repo"
).split("/");
const LINK_FILE_PATH = "source/_data/link.yml"; // 友链文件路径，根据你的博客结构修改

// 邮件通知配置
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "your-email@example.com";
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || "smtp.example.com",
  port: parseInt(process.env.SMTP_PORT || "465"),
  secure: true,
  user: process.env.SMTP_USER || "your-smtp-user",
  pass: process.env.SMTP_PASS || "your-smtp-password",
};
// ============ 配置结束 ============

export async function applyFriend(friendApply: FriendApply): Promise<ObjectId> {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection<FriendApply>(collectionName);
    const result = await collection.insertOne({
      ...friendApply,
      createdAt: new Date(),
    });
    return result.insertedId;
  } finally {
    await client.close();
  }
}

export async function createFriendPr({
  name,
  link,
  avatarLink,
  descr,
}: Omit<FriendApply, "email" | "state">): Promise<string> {
  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const owner = GITHUB_OWNER;
  const repo = GITHUB_REPO;
  const filePath = LINK_FILE_PATH;

  // 1. 获取文件内容和sha
  const { data: fileData } = await octokit.request(
    "GET /repos/{owner}/{repo}/contents/{path}",
    {
      owner,
      repo,
      path: filePath,
    }
  );

  const content = Buffer.from((fileData as any).content, "base64").toString(
    "utf-8"
  );

  // 2. 直接文本追加新内容
  const newEntry = `\n    - name: ${name}\n      link: ${link}\n      avatar: ${avatarLink}\n      descr: ${descr}`;
  const updatedContent = content + newEntry;

  // 3. 新建分支
  const timestamp = Date.now();
  const branch = `add-friend-${name.replace(
    /[^a-zA-Z0-9]/g,
    ""
  )}-${link.replace(/[^a-zA-Z0-9]/g, "")}-${timestamp}`;

  // 获取默认分支名
  const { data: repoData } = await octokit.request(
    "GET /repos/{owner}/{repo}",
    { owner, repo }
  );
  const baseBranch = repoData.default_branch;

  // 获取base分支最新commit sha
  const { data: refData } = await octokit.request(
    "GET /repos/{owner}/{repo}/git/ref/heads/{branch}",
    {
      owner,
      repo,
      branch: baseBranch,
    }
  );
  const baseCommitSha = refData.object.sha;

  // 创建新分支
  await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: baseCommitSha,
  });

  // 4. 更新文件到新分支
  await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
    owner,
    repo,
    path: filePath,
    message: `add friend link: ${name}`,
    content: Buffer.from(updatedContent, "utf-8").toString("base64"),
    branch,
    sha: (fileData as any).sha,
  });

  // 5. 创建PR
  const prTitle = `友链申请：${link}`;
  const prBody = `自动提交友链申请 by API` + "\n\n" + newEntry;
  const { data: pr } = await octokit.request(
    "POST /repos/{owner}/{repo}/pulls",
    {
      owner,
      repo,
      title: prTitle,
      head: branch,
      base: baseBranch,
      body: prBody,
    }
  );

  // 添加标签
  await octokit.request(
    "POST /repos/{owner}/{repo}/issues/{issue_number}/labels",
    {
      owner,
      repo,
      issue_number: pr.number,
      labels: ["friend"],
    }
  );

  return pr.html_url;
}

// 生成友链条目的 YAML 格式字符串
export function generateFriendYamlEntry(
  friend: Omit<FriendApply, "email" | "state">
): string {
  return `\n    - name: ${friend.name}\n      link: ${friend.link}\n      avatar: ${friend.avatarLink}\n      descr: ${friend.descr}`;
}

// 计算文件内容的差异
export function calculateFileDiff(
  oldContent: string,
  newContent: string
): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const diff: string[] = [];

  if (oldLines.length > 0 && oldLines[0] !== "") {
    oldLines.forEach((line) => {
      if (line.trim() !== "") {
        diff.push(`- ${line}`);
      }
    });
    diff.push("");
  }

  newLines.forEach((line) => {
    if (line.trim() !== "") {
      diff.push(`+ ${line}`);
    }
  });

  return diff.join("\n");
}

import yaml from "js-yaml";

// 获取原始友链信息
export async function getOriginalFriendInfo(
  originalLink: string
): Promise<string | null> {
  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const owner = GITHUB_OWNER;
  const repo = GITHUB_REPO;
  const filePath = LINK_FILE_PATH;

  try {
    const { data: fileData } = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner,
        repo,
        path: filePath,
      }
    );

    const content = Buffer.from((fileData as any).content, "base64").toString(
      "utf-8"
    );
    const normalizedOriginalLink = originalLink
      .replace(/^(https?:\/\/)?(www\.)?/i, "")
      .replace(/\/$/, "");

    const linkData = yaml.load(content) as any[];

    for (const category of linkData) {
      if (category.link_list && Array.isArray(category.link_list)) {
        for (const friendLink of category.link_list) {
          if (friendLink.link) {
            const normalizedFriendLink = friendLink.link
              .replace(/^(https?:\/\/)?(www\.)?/i, "")
              .replace(/\/$/, "");

            if (normalizedFriendLink === normalizedOriginalLink) {
              return (
                "- " +
                yaml.dump(friendLink).replace(/\n/g, "\n  ").trim() +
                "\n"
              );
            }
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error("获取原始友链信息失败:", error);
    return null;
  }
}

export async function updateFriendPr(
  originalLink: string,
  newFriend: Omit<FriendApply, "email" | "state">
): Promise<string | null> {
  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const owner = GITHUB_OWNER;
  const repo = GITHUB_REPO;
  const filePath = LINK_FILE_PATH;

  try {
    const { data: fileData } = await octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner,
        repo,
        path: filePath,
      }
    );

    const content = Buffer.from((fileData as any).content, "base64").toString(
      "utf-8"
    );
    const normalizedOriginalLink = originalLink
      .replace(/^(https?:\/\/)?(www\.)?/i, "")
      .replace(/\/$/, "");

    const linkData = yaml.load(content) as any[];
    let updatedLinkData = JSON.parse(JSON.stringify(linkData));
    let found = false;

    for (let i = 0; i < linkData.length; i++) {
      if (linkData[i].link_list && Array.isArray(linkData[i].link_list)) {
        for (let j = 0; j < linkData[i].link_list.length; j++) {
          const friendLink = linkData[i].link_list[j];
          if (friendLink.link) {
            const normalizedFriendLink = friendLink.link
              .replace(/^(https?:\/\/)?(www\.)?/i, "")
              .replace(/\/$/, "");

            if (normalizedFriendLink === normalizedOriginalLink) {
              updatedLinkData[i].link_list[j] = {
                name: newFriend.name,
                link: newFriend.link,
                avatar: newFriend.avatarLink,
                descr: newFriend.descr,
              };
              found = true;
              break;
            }
          }
        }
        if (found) break;
      }
    }

    if (!found) {
      await sendNotifyMail(
        {
          to: ADMIN_EMAIL,
          subject: "友链修改失败通知",
          html: `
            <p>友链修改失败，未找到原始友链：${originalLink}</p>
            <p>新的友链信息：</p>
            <ul>
              <li>名称: ${newFriend.name}</li>
              <li>链接: ${newFriend.link}</li>
              <li>头像: ${newFriend.avatarLink}</li>
              <li>描述: ${newFriend.descr}</li>
            </ul>
          `,
        },
        SMTP_CONFIG
      );
      return null;
    }

    const newContent = yaml.dump(updatedLinkData, { indent: 2, flowLevel: -1 });
    const formattedNewContent = newContent
      .replace(/^(\s*)\n-/gm, "$1\n  -")
      .trim();
    const newEntry = generateFriendYamlEntry(newFriend);

    const timestamp = Date.now();
    const branch = `update-friend-${newFriend.name.replace(
      /[^a-zA-Z0-9]/g,
      ""
    )}-${timestamp}`;

    const { data: repoData } = await octokit.request(
      "GET /repos/{owner}/{repo}",
      { owner, repo }
    );
    const baseBranch = repoData.default_branch;

    const { data: refData } = await octokit.request(
      "GET /repos/{owner}/{repo}/git/ref/heads/{branch}",
      { owner, repo, branch: baseBranch }
    );
    const baseCommitSha = refData.object.sha;

    await octokit.request("POST /repos/{owner}/{repo}/git/refs", {
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: baseCommitSha,
    });

    await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: filePath,
      message: `update friend link: ${newFriend.name}`,
      content: Buffer.from(formattedNewContent, "utf-8").toString("base64"),
      branch,
      sha: (fileData as any).sha,
    });

    const prTitle = `友链更新：${newFriend.link}`;
    const prBody = `自动更新友链 by API` + "\n\n" + newEntry;
    const { data: pr } = await octokit.request(
      "POST /repos/{owner}/{repo}/pulls",
      {
        owner,
        repo,
        title: prTitle,
        head: branch,
        base: baseBranch,
        body: prBody,
      }
    );

    await octokit.request(
      "POST /repos/{owner}/{repo}/issues/{issue_number}/labels",
      {
        owner,
        repo,
        issue_number: pr.number,
        labels: ["friend", "update"],
      }
    );

    return pr.html_url;
  } catch (error) {
    console.error("更新友链PR失败:", error);
    await sendNotifyMail(
      {
        to: ADMIN_EMAIL,
        subject: "友链修改失败通知",
        html: `
          <p>友链修改PR创建失败，原始友链：${originalLink}</p>
          <p>错误信息：${(error as Error).message}</p>
        `,
      },
      SMTP_CONFIG
    );
    return null;
  }
}
