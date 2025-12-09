# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Login handler."""

import json

# import tornado
from jupyter_server.base.handlers import APIHandler
from jupyter_server.extension.handler import ExtensionHandlerMixin


# pylint: disable=W0223
class LoginHandler(ExtensionHandlerMixin, APIHandler):
    """The login handler."""

    #    @tornado.web.authenticated
    def post(self) -> None:
        """Login."""
        data = json.loads(self.request.body)
        print(data)
        self.write("")
        self.finish("")
