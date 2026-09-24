import type http from 'http'
import type {Duplex} from 'node:stream'
import * as httpProxy from 'http-proxy'

function safeDestroy(
  socket?: Duplex | null
) {
  try {
    if (
      socket &&
      !socket.destroyed
    )
      socket.destroy()
  } catch {}
}

export function attachGotifyWsProxy(
  server: http.Server
) {
  try {
    // const GOTIFY_ORIGIN_ = process.env.IN_APP_URL?.split("/message")?.[0] || "https://gotify.i24.dev";
    // const GOTIFY_ORIGIN_ = process.env.IN_APP_URL || "https://gotify.i24.dev";

    function toHttp(
      url: string
    ): string {
      if (!url) return url

      const s = url.trim()

      // https -> http
      if (
        s.startsWith(
          'https://'
        )
      )
        return (
          'http://' +
          s.slice(
            'https://'.length
          )
        )

      // wss -> ws (เผื่อใช้กับ websocket)
      if (
        s.startsWith('wss://')
      )
        return (
          'ws://' +
          s.slice(
            'wss://'.length
          )
        )

      return s
    }
    // const GOTIFY_ORIGIN = toHttp(GOTIFY_ORIGIN_)
    const GOTIFY_ORIGIN =
      `ws://${process.env.IN_APP_URL}` ||
      'wss://gotify.i24.dev'
    const GOTIFY_TOKEN =
      process.env
        .IN_APP_URL_RE_TOKEN ||
      'C8hqpcQp4IeLaCd'
    const env =
      process.env.NODE_ENV ??
      'development'
    const pttEnv = [
      'production',
      'pre-production',
      'dr'
    ]
    const proxy =
      httpProxy.createProxyServer(
        {
          target:
            GOTIFY_ORIGIN,
          ws: true,
          changeOrigin:
            !pttEnv.includes(
              env
            ),
          // changeOrigin: false,
          secure: true
        }
      )

    proxy.on(
      'error',
      (
        err,
        _req,
        socket: any
      ) => {
        console.error(
          '[proxy error]',
          err
        )
        try {
          if (
            socket &&
            !socket.destroyed
          ) {
            socket.write(
              'HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n'
            )
          }
        } catch {}
        try {
          if (
            socket &&
            !socket.destroyed
          )
            socket.destroy()
        } catch {}
      }
    )

    server.on(
      'upgrade',
      (req, socket, head) => {
        // host /master เครื่อง dev ไม่ผ่าน gateway
        const path_ =
          !pttEnv.includes(
            env
          )
            ? '/master/notice'
            : '/notice'
        if (
          !req.url?.startsWith(
            path_
          )
        )
          return

        req.url = `/stream?token=${encodeURIComponent(GOTIFY_TOKEN)}`

        if (
          !pttEnv.includes(
            env
          )
        ) {
          req.headers[
            'origin'
          ] = GOTIFY_ORIGIN
          req.headers[
            'host'
          ] = new URL(
            GOTIFY_ORIGIN
          ).host
        }

        socket.on(
          'error',
          (err) => {
            console.error(
              '[client socket error]',
              err
            )
            try {
              if (
                !socket.destroyed
              )
                socket.destroy()
            } catch {}
          }
        )

        req.on(
          'error',
          (err) => {
            console.error(
              '[upgrade req error]',
              err
            )
            try {
              if (
                !socket.destroyed
              )
                socket.destroy()
            } catch {}
          }
        )

        proxy.ws(
          req,
          socket,
          head
        )
      }
    )

    // server.on("clientError", (err, socket) => {
    //   console.error("[Warning]:", (err as NodeJS.ErrnoException).code, err.message);
    //   safeDestroy(socket);
    // });
  } catch (error) {}
}
