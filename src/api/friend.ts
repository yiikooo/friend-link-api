import express, { type Request, type Response, Router } from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import { sendNotifyMail, type SmtpConfig } from '../service/mailService.js';
import {
  applyFriend,
  createFriendPr,
  updateFriendPr,
  calculateFileDiff,
  generateFriendYamlEntry,
  getOriginalFriendInfo,
  type FriendApply,
} from '../service/friendService.js';

const router: Router = express.Router();

// ============ 请修改以下配置 ============
// MongoDB 连接字符串
const uri = process.env.MONGODB_URI || 'your-mongodb-connection-string';
const dbName = 'api';
const collectionName = 'friend-apply';

// 审核密码，用于验证PR创建请求
const PR_PASSWORD = process.env.PR_PASSWORD || 'your-secure-password-here';

// 管理员邮箱
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'your-email@example.com';

// API 域名，用于生成审核链接
const API_DOMAIN = process.env.API_DOMAIN || 'https://your-api-domain.com';

// SMTP 配置
const SMTP_CONFIG: SmtpConfig = {
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  user: process.env.SMTP_USER || 'your-smtp-user',
  pass: process.env.SMTP_PASS || 'your-smtp-password',
};
// ============ 配置结束 ============

// 友链状态枚举
enum FRIEND_STATUS {
  PENDING = '待审核',
  APPROVED = '已通过',
  REJECTED = '已拒绝',
}

// POST /apply - 提交友链申请
router.post('/apply', async (req: Request, res: Response) => {
  const { name, link, avatarLink, descr, email } = req.body;
  if (!name || !link || !avatarLink || !descr || !email) {
    return res
      .status(400)
      .json({ success: false, error: '缺少参数 name、link、avatarLink、descr 或 email' });
  }
  try {
    const insertedId = await applyFriend({
      name,
      link,
      avatarLink,
      descr,
      email,
      state: FRIEND_STATUS.PENDING,
    });
    // 发送通知邮件给管理员
    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 400px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; box-shadow: 0 2px 8px #f0f1f2; padding: 24px;">
        <h2 style="color: #1677ff;">收到新的友链申请</h2>
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <img src="${avatarLink}" alt="头像" style="width: 64px; height: 64px; border-radius: 50%; border: 1px solid #eee; object-fit: cover; background: #f5f5f5; margin-right: 16px;">
          <div>
            <div style="font-size: 18px; font-weight: bold;">${name}</div>
            <a href="${link}" style="color: #1677ff; text-decoration: none;">${link}</a>
          </div>
        </div>
        <div style="margin-bottom: 8px;"><b>描述：</b>${descr}</div>
        <div style="margin-bottom: 8px;"><b>联系邮箱：</b>${email}</div>
        <div style="color: #888; font-size: 12px;">申请时间：${new Date().toLocaleString('zh-CN', { hour12: false })}</div>
        <a href="${API_DOMAIN}/api/friend-review?id=${insertedId}&pwd=${PR_PASSWORD}" style="display:inline-block;margin-top:18px;padding:10px 24px;background:#1677ff;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">审核友链</a>
      </div>
    `;
    try {
      await sendNotifyMail(
        { to: ADMIN_EMAIL, html, subject: `新的友链申请: ${name} - ${link}` },
        SMTP_CONFIG
      );
    } catch (mailErr) {
      console.error('邮件发送失败:', mailErr);
    }
    res.json({ success: true, id: insertedId });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /list - 查询所有申请列表
router.get('/list', async (req: Request, res: Response) => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection<FriendApply>(collectionName);
    const list = await collection.find({}).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await client.close();
  }
});

// GET /detail - 获取单个友链申请详情
router.get('/detail', async (req: Request, res: Response) => {
  const { id, pwd } = req.query;
  if (!id) return res.status(400).json({ success: false, error: '缺少id参数' });
  if (!pwd || pwd !== PR_PASSWORD)
    return res.status(403).json({ success: false, error: '密码错误或缺失' });

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection<FriendApply>(collectionName);
    const friend = await collection.findOne({
      _id: typeof id === 'string' ? new ObjectId(id) : new ObjectId(id!.toString()),
    });
    if (!friend) return res.status(404).json({ success: false, error: '未找到该申请' });

    res.json({ success: true, data: friend });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await client.close();
  }
});

// POST /update - 更新友链申请信息
router.post('/update', async (req: Request, res: Response) => {
  const { id, pwd, name, link, avatarLink, descr, state, email } = req.body;
  if (!id) return res.status(400).json({ success: false, error: '缺少id参数' });
  if (!pwd || pwd !== PR_PASSWORD)
    return res.status(403).json({ success: false, error: '密码错误或缺失' });

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection<FriendApply>(collectionName);

    await collection.updateOne(
      { _id: typeof id === 'string' ? new ObjectId(id) : new ObjectId(id as string) },
      {
        $set: {
          name,
          link,
          avatarLink,
          descr,
          state,
          email,
          updatedAt: new Date(),
        },
      }
    );

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await client.close();
  }
});

// 发送审核结果通知邮件
async function sendResultNotification(
  friend: FriendApply,
  isApproved: boolean,
  rejectReason: string = ''
): Promise<boolean> {
  if (!friend || !friend.email) return false;

  let subject = isApproved ? '您的友链申请已通过' : '您的友链申请未通过审核';

  let html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 30px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: ${isApproved ? '#52c41a' : '#ff4d4f'}; margin: 15px 0 5px;">${isApproved ? '友链申请已通过！' : '友链申请未通过审核'}</h2>
        <p style="color: #888; margin: 0;">审核时间: ${new Date().toLocaleString('zh-CN', { hour12: false })}</p>
      </div>
      
      <div style="background-color: #f9f9f9; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; margin-bottom: 15px;">
          <img src="${friend.avatarLink}" alt="${friend.name}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; margin-right: 15px; border: 1px solid #eee;">
          <div>
            <div style="font-weight: bold; font-size: 16px;">${friend.name}</div>
            <a href="${friend.link}" style="color: #1677ff; text-decoration: none; font-size: 14px;">${friend.link}</a>
          </div>
        </div>
        <div style="color: #333; margin-bottom: 10px; font-size: 14px;">${friend.descr}</div>
      </div>
  `;

  if (isApproved) {
    html += `
      <div style="background-color: #f6ffed; border: 1px solid #b7eb8f; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
        <p style="color: #52c41a; margin: 0 0 10px; font-weight: bold;">恭喜！您的友链申请已通过审核</p>
        <p style="margin: 0; color: #333;">您的网站已被添加到我们的友链列表中，请等待CDN刷新，感谢您的支持！</p>
      </div>
    `;
  } else {
    html += `
      <div style="background-color: #fff2f0; border: 1px solid #ffccc7; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
        <p style="color: #ff4d4f; margin: 0 0 10px; font-weight: bold;">很抱歉，您的友链申请未通过审核</p>
        <p style="margin: 0; color: #333;">拒绝原因: ${rejectReason || '未提供拒绝理由'}</p>
      </div>
      <div style="margin-top: 20px;">
        <p style="color: #888; margin: 0;">如有疑问，请联系管理员 (${ADMIN_EMAIL})。</p>
      </div>
    `;
  }

  html += `
      <div style="margin-top: 30px; text-align: center; color: #888; font-size: 12px; border-top: 1px solid #eee; padding-top: 20px;">
        <p>此邮件由系统自动发送，请勿直接回复</p>
      </div>
    </div>
  `;

  try {
    await sendNotifyMail({ to: friend.email, subject, html }, SMTP_CONFIG);
    return true;
  } catch (error) {
    console.error('发送审核结果通知邮件失败:', error);
    return false;
  }
}

// POST /create-pr - 创建友链PR
router.post('/create-pr', async (req: Request, res: Response) => {
  const { id, pwd } = req.body;
  if (!id) return res.status(400).json({ success: false, error: '缺少id参数' });
  if (!pwd || pwd !== PR_PASSWORD)
    return res.status(403).json({ success: false, error: '密码错误或缺失' });

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection<FriendApply>(collectionName);
    const friend = await collection.findOne({
      _id: typeof id === 'string' ? new ObjectId(id) : new ObjectId(id!.toString()),
    });
    if (!friend) return res.status(404).json({ success: false, error: '未找到该申请' });

    // 更新状态为已通过
    await collection.updateOne(
      { _id: friend._id },
      { $set: { state: FRIEND_STATUS.APPROVED, updatedAt: new Date() } }
    );

    let prUrl: string;
    if (friend.originalLink) {
      // 友链更新申请
      const updatePrUrl = await updateFriendPr(friend.originalLink, {
        name: friend.name,
        link: friend.link,
        avatarLink: friend.avatarLink,
        descr: friend.descr,
      });
      if (!updatePrUrl) {
        throw new Error('更新友链PR失败，请检查原始链接是否正确');
      }
      prUrl = updatePrUrl;
    } else {
      // 新友链申请
      prUrl = await createFriendPr({
        name: friend.name,
        link: friend.link,
        avatarLink: friend.avatarLink,
        descr: friend.descr,
      });
    }

    // 发送通过通知邮件
    try {
      await sendResultNotification(friend, true);
    } catch (mailErr) {
      console.error('发送通过通知邮件失败:', mailErr);
    }

    res.json({ success: true, prUrl });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await client.close();
  }
});

// POST /reject - 拒绝友链申请
router.post('/reject', async (req: Request, res: Response) => {
  const { id, pwd, reason } = req.body;
  if (!id) return res.status(400).json({ success: false, error: '缺少id参数' });
  if (!pwd || pwd !== PR_PASSWORD)
    return res.status(403).json({ success: false, error: '密码错误或缺失' });

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection<FriendApply>(collectionName);

    const friend = await collection.findOne({
      _id: typeof id === 'string' ? new ObjectId(id) : new ObjectId(id!.toString()),
    });
    if (!friend) return res.status(404).json({ success: false, error: '未找到该申请' });

    await collection.updateOne(
      { _id: friend._id },
      {
        $set: {
          state: FRIEND_STATUS.REJECTED,
          rejectReason: reason || '未提供拒绝理由',
          updatedAt: new Date(),
        },
      }
    );

    try {
      await sendResultNotification(friend, false, reason);
    } catch (mailErr) {
      console.error('发送拒绝通知邮件失败:', mailErr);
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await client.close();
  }
});

// GET /match-friend - 匹配友链信息
router.get('/match-friend', async (req: Request, res: Response) => {
  const { url } = req.query;
  try {
    const info = await getOriginalFriendInfo(url as string);
    res.json({
      success: info != null,
      info: info != null ? info : '未找到该友链',
    });
  } catch (error) {
    console.error('匹配友链信息失败:', error);
    res.status(500).json({ success: false, info: error });
  }
});

// GET /preview-diff - 获取友链更新的文件变更预览
router.get('/preview-diff', async (req: Request, res: Response) => {
  const { id, pwd } = req.query;
  if (!id) return res.status(400).json({ success: false, error: '缺少id参数' });
  if (!pwd || pwd !== PR_PASSWORD)
    return res.status(403).json({ success: false, error: '密码错误或缺失' });

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection<FriendApply>(collectionName);
    const friend = await collection.findOne({
      _id: typeof id === 'string' ? new ObjectId(id) : new ObjectId(id!.toString()),
    });
    if (!friend) return res.status(404).json({ success: false, error: '未找到该申请' });

    let oldEntry = '';
    let newEntry = '';

    if (friend.originalLink) {
      const originalFriendInfo = await getOriginalFriendInfo(friend.originalLink);
      if (originalFriendInfo) {
        oldEntry = originalFriendInfo;
      } else {
        oldEntry = `# 未找到原始友链: ${friend.originalLink}`;
      }
      newEntry = generateFriendYamlEntry({
        name: friend.name,
        link: friend.link,
        avatarLink: friend.avatarLink,
        descr: friend.descr,
      });
    } else {
      oldEntry = '';
      newEntry = generateFriendYamlEntry({
        name: friend.name,
        link: friend.link,
        avatarLink: friend.avatarLink,
        descr: friend.descr,
      });
    }

    const diff = calculateFileDiff(oldEntry, newEntry);

    res.json({
      success: true,
      data: {
        diff,
        oldEntry,
        newEntry,
        type: friend.originalLink ? 'update' : 'new',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await client.close();
  }
});

// POST /update-friend - 友链更新申请（无需权限验证）
router.post('/update-friend', async (req: Request, res: Response) => {
  const { originalLink, name, link, avatarLink, descr, email } = req.body;
  if (!originalLink || !name || !link || !avatarLink || !descr || !email) {
    return res.status(400).json({
      success: false,
      error: '缺少参数 originalLink、name、link、avatarLink、descr 或 email',
    });
  }
  try {
    const insertedId = await applyFriend({
      name,
      link,
      avatarLink,
      descr,
      email,
      state: FRIEND_STATUS.PENDING,
      originalLink,
    });
    const html = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 400px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; box-shadow: 0 2px 8px #f0f1f2; padding: 24px;">
        <h2 style="color: #1677ff;">收到新的友链更新申请</h2>
        <div style="margin-bottom: 16px;">
          <div style="color: #888; font-size: 12px; margin-bottom: 8px;">原链接：${originalLink}</div>
          <div style="display: flex; align-items: center; margin-bottom: 16px;">
            <img src="${avatarLink}" alt="头像" style="width: 64px; height: 64px; border-radius: 50%; border: 1px solid #eee; object-fit: cover; background: #f5f5f5; margin-right: 16px;">
            <div>
              <div style="font-size: 18px; font-weight: bold;">${name}</div>
              <a href="${link}" style="color: #1677ff; text-decoration: none;">${link}</a>
            </div>
          </div>
          <div style="margin-bottom: 8px;"><b>描述：</b>${descr}</div>
          <div style="margin-bottom: 8px;"><b>联系邮箱：</b>${email}</div>
        </div>
        <div style="color: #888; font-size: 12px;">申请时间：${new Date().toLocaleString('zh-CN', { hour12: false })}</div>
        <a href="${API_DOMAIN}/api/friend-review?id=${insertedId}&pwd=${PR_PASSWORD}" style="display:inline-block;margin-top:18px;padding:10px 24px;background:#1677ff;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">审核友链更新</a>
      </div>
    `;
    try {
      await sendNotifyMail(
        { to: ADMIN_EMAIL, html, subject: `新的友链更新申请: ${name} - ${originalLink}` },
        SMTP_CONFIG
      );
    } catch (mailErr) {
      console.error('邮件发送失败:', mailErr);
    }
    res.json({ success: true, id: insertedId, message: '友链更新申请已提交，等待管理员审核' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
