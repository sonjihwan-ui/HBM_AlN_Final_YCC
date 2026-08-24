import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename=fileURLToPath(import.meta.url);
const root=path.dirname(__filename);
const PORT=Number(process.env.PORT||3000);
const MIME={
  ".html":"text/html; charset=utf-8",
  ".js":"application/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".md":"text/markdown; charset=utf-8",
  ".svg":"image/svg+xml"
};

const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,"http://localhost");
    let rel=decodeURIComponent(u.pathname);
    if(rel==="/") rel="/index.html";
    let full=path.normalize(path.join(root,rel));
    if(!full.startsWith(root)){res.writeHead(403);res.end("Forbidden");return;}
    try{
      const st=await stat(full);
      if(st.isDirectory()) full=path.join(full,"index.html");
    }catch{
      full=path.join(root,"index.html"); // SPA fallback
    }
    const data=await readFile(full);
    res.writeHead(200,{"Content-Type":MIME[path.extname(full)]||"application/octet-stream","Cache-Control":"no-cache"});
    res.end(data);
  }catch(e){
    res.writeHead(500,{"Content-Type":"text/plain; charset=utf-8"});
    res.end(`Server error: ${e.message}`);
  }
});
server.listen(PORT,"0.0.0.0",()=>console.log(`HBM AlN Final 11.0 running on http://0.0.0.0:${PORT}`));
