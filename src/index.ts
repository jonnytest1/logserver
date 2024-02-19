import { IncomingMessage, ServerResponse, createServer } from 'http';
import { insert, insertChecked } from './routes/insert';
import { getLogs } from './routes/get-logs';
import { distinctAttribute } from './routes/distinct-attribute';
import { ResponseCodeError } from './util/response-code-error';
import { resolve, extname, join } from "path"
import { createReadStream, readFileSync, statSync } from 'fs';
const searchPastNDays = 7

const pathsFunctions: Record<string, (url: URL, req: IncomingMessage, res: ServerResponse) => (void | Promise<void>)> = {
    "/healthcheck": (u, req, res) => {
        console.log("healthcheck")
        res.writeHead(200)
        res.end()
    },
    "/logs": getLogs,
    "/logs.php": getLogs,
    "/unique-attribute": distinctAttribute,
    "/insert": insert,
    "/index.php": insert
}

const staticFiles = join(__dirname, "static")

const contentTypeMap = {
    ".js": "application/javascript",
    ".html": "text/html",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png"
}


createServer(async (req, res) => {
    const url = req.url;
    if (url) {
        const urlObj = new URL(url, "http://myhost.net")
        try {
            //console.log("request to " + req.url)
            if (pathsFunctions[urlObj.pathname]) {
                await pathsFunctions[urlObj.pathname]?.(urlObj, req, res)
            } else {
                let path = urlObj.pathname
                if (path == "/") {
                    path = "/index.html"
                }
                const ext = extname(path)
                const contentType = contentTypeMap[ext]
                if (contentType) {

                    const resolved = resolve(join(staticFiles, path))

                    if (resolved.includes(staticFiles)) {
                        try {
                            let stream = readFileSync(resolved)
                            let acceptEncoding = req.headers['accept-encoding'] as string;
                            if (!acceptEncoding) {
                                acceptEncoding = '';
                            }
                            const stat = statSync(resolved);
                            const headers = {
                                'Content-Type': contentTypeMap[ext],
                                'Content-Length': stat.size
                            }
                            if (acceptEncoding.match(/\bgzip\b/)) {
                                //stream = stream.pipe(createGzip())
                            }
                            res.writeHead(200, headers);
                            res.write(stream)
                            return
                        } catch (e) {
                            res.writeHead(404)
                            res.end()
                            console.info(e)
                            return
                        }
                    }

                }


                console.error("no endpoint for " + urlObj.pathname)
                insertChecked({
                    application: "Logging",
                    Severity: "ERROR",
                    ip: "-",
                    message: "no endpoint for path",
                    path: urlObj.pathname
                })
            }
        } catch (e) {
            if (e instanceof ResponseCodeError) {
                res.writeHead(e.status)
                res.write(e.message);
                return
            }


            res.writeHead(500)

            console.error(e)
            insertChecked({
                application: "Logging",
                Severity: "ERROR",
                ip: "-",
                message: "error while handling request",
                error_message: `${e.message}`,
                error_stack: `${e.stack}`
            })
        } finally {
            res.end()
        }
    }
})
    .listen(19999, () => {
        console.log("serer started listening")
    })



process.on("uncaughtException", e => {
    console.error("uncaughtException", e)
})
process.on("unhandledRejection", e => {
    console.error("unhandledRejection", e)
})