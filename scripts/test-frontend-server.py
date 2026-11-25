"""Serve the isolated TEST snapshot without reusing cached frontend assets."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class TestFrontendHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript'}

    def send_head(self):
        # A browser may still have validators from a previously served snapshot.
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', required=True, type=Path)
    args = parser.parse_args()
    if not args.directory.is_dir():
        parser.error('The TEST snapshot directory is missing.')
    handler = partial(TestFrontendHandler, directory=str(args.directory))
    with ThreadingHTTPServer(('127.0.0.1', 8765), handler) as server:
        server.serve_forever()


if __name__ == '__main__':
    main()
