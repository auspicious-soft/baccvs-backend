import { Router } from 'express';
import {
  createRepost,
  deleteRepost,
  getUserReposts
} from 'src/controllers/repost/repost-controller';

const router = Router();

router.post('/', createRepost);
router.delete('/:repostId', deleteRepost);
router.get('/user', getUserReposts);

export { router };