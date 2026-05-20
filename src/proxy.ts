import { NextRequest, NextResponse } from 'next/server';

const SERVER_ACTION_HEADER = 'next-action';

export function proxy(request: NextRequest) {
  if (request.method === 'POST' && request.headers.has(SERVER_ACTION_HEADER)) {
    return new NextResponse('Server action not found.', {
      status: 404,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
        'x-nextjs-action-not-found': '1',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
