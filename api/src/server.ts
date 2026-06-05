// api/src/server.ts
import express from 'express';
import saveGraphRouter from './routes/saveGraph';
import graphsRouter from "./routes/graphs";
import {PORT} from "./constants";

const app = express();

app
    .use(express.json())

    .use('/api/graphs', graphsRouter)
    .use('/api/graph/save', saveGraphRouter)

    .use('/api/media', express.static('/workspace/storage'))

    .listen(PORT, () => {
        console.log(`TS Server is running on http://localhost:${PORT}`);
    });