import express from 'express';
import editorRouter from './routes/editor';

const app = express();
const PORT = 3000;

app.use(express.json());

app.use('/api/editor', editorRouter);

app.listen(PORT, () => {
    console.log(`TS Server is running on http://localhost:${PORT}`);
});