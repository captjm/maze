// api/src/routes/saveGraph.ts
import { Router } from 'express';
import path from 'path';
import {GRAPHS_DIR} from "../constants";
import fs from 'fs/promises';

const router = Router();

router.post('/', async (req, res) => {
    try {
        const fileName = req.query.file as string;

        if (!fileName) {
            return res.status(400).json({ error: 'Missing "file" query parameter' });
        }

        const safeFileName = path.basename(fileName);
        const targetPath = path.join(GRAPHS_DIR, safeFileName);

        const graphData = req.body;
        if (!graphData || typeof graphData !== 'object') {
            return res.status(400).json({ error: 'Invalid or empty graph data package' });
        }

        const jsonString = JSON.stringify(graphData, null, 2);

        await fs.mkdir(GRAPHS_DIR, { recursive: true });
        await fs.writeFile(targetPath, jsonString, 'utf8');

        console.log(`[Autosave] Successfully updated graph file: ${safeFileName}`);
        res.json({ success: true, file: safeFileName });
    } catch (error) {
        console.error('Error writing graph file:', error);
        res.status(500).json({ error: 'Failed to save graph file data' });
    }
});

export default router;