import fs from "fs";
import path from "path";

const extensions = [".ts", ".tsx", ".js", ".jsx", ".css"];

function walk(dir: string) {
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            walk(fullPath);
            continue;
        }

        const ext = path.extname(fullPath);
        if (!extensions.includes(ext)) continue;

        const relPath = path.relative(process.cwd(), fullPath);
        const content = fs.readFileSync(fullPath, "utf8");

        if (content.startsWith(`// ${relPath}`) || content.startsWith(`/* ${relPath}`)) {
            continue;
        }

        const prefix =
            ext === ".css"
                ? `/* ${relPath} */\n`
                : `// ${relPath}\n`;

        fs.writeFileSync(fullPath, prefix + content, "utf8");
    }
}

walk("./src");