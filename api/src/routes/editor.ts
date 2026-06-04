import { Router, Request, Response } from 'express';
import { CutVideoRequest } from '../types/editor';

const router = Router();

router.post('/cut', (req: Request<{}, {}, CutVideoRequest>, res: Response) => {

});

export default router;