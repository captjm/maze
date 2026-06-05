// api/src/routes/graphs.ts
import { Router } from 'express';
import path from 'path';
import {GRAPHS_DIR} from "../constants";
import fs from 'fs/promises';

const router = Router();

router.get('/', async (req, res) => {
    try {
        await fs.mkdir(GRAPHS_DIR, { recursive: true });
        const files = await fs.readdir(GRAPHS_DIR);
        const jsonFiles = files.filter(file => path.extname(file).toLowerCase() === '.json');
        res.json(jsonFiles);
    } catch (error) {
        console.error('Error reading graphs folder:', error);
        res.status(500).json({ error: 'Failed to get file list' });
    }
});

export default router;