import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import editorRouter from './routes/editor';

const app = express();
const PORT = 3000;

const GRAPHS_DIR = '/workspace/storage/graphs';

app.use(express.json());

app.get('/api/graphs', async (req, res) => {
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


app.use('/api/editor', editorRouter);

app.use('/api/media', express.static('/workspace/storage'));

app.listen(PORT, () => {
    console.log(`TS Server is running on http://localhost:${PORT}`);
});