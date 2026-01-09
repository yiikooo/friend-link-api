import express from 'express';
import friend from './friend.js';

const router = express.Router();

router.use('/friend', friend);

router.get('/friend-review', (req, res) => {
  res.render('friend-review', {
    title: '友链审核',
    id: req.query.id,
    pwd: req.query.pwd,
  });
});

export default router;
