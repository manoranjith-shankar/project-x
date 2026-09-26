export const config = {
  matcher: ["/((?!_vercel).*)"],
};

export default function middleware(request) {
  const base = process.env.NGROK_URL?.replace(/\/$/, "");
  if (!base) {
    return new Response(
      "Set NGROK_URL in this Vercel project (e.g. https://abc123.ngrok-free.app). See prototype/DEPLOYMENT.md.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const incoming = new URL(request.url);
  const target = `${base}${incoming.pathname}${incoming.search}`;

  // Temporary redirect so you can change NGROK_URL without browsers caching the old tunnel.
  return Response.redirect(target, 307);
}
