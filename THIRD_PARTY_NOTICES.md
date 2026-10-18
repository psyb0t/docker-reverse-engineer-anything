# Third-party notices

The `psyb0t/reverse-engineer-anything` image redistributes the components below
unmodified. This repository's own code (the bridge, Dockerfiles, scripts and
agent integration files) is under the WTFPL in `LICENSE`.

| Component                | Version                         | License                              | Source                                                     |
| ------------------------ | ------------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| REA (`rea-agents`)       | 6.4.0                           | MIT                                  | https://github.com/morluto/rea                             |
| jadx-headless-mcp (JADX) | 0.7.1                           | Apache-2.0                           | https://github.com/1013503897/jadx-headless-mcp            |
| Apktool                  | 3.0.3                           | Apache-2.0                           | https://github.com/iBotPeaches/Apktool                     |
| OpenJDK 21               | Debian trixie package           | GPL-2.0 with the Classpath Exception | https://packages.debian.org/trixie/openjdk-21-jdk-headless |
| adb                      | Debian trixie package           | Apache-2.0                           | https://packages.debian.org/trixie/adb                     |
| Node.js                  | 24 (official image)             | MIT                                  | https://github.com/nodejs/node                             |
| tini                     | Debian trixie package           | MIT                                  | https://github.com/krallin/tini                            |
| procps                   | Debian trixie package           | GPL-2.0-or-later                     | https://gitlab.com/procps-ng/procps                        |
| MCP TypeScript SDK       | server/client 2.3.1, node 2.1.1 | MIT                                  | https://github.com/modelcontextprotocol/typescript-sdk     |
| pino                     | 10.4.0                          | MIT                                  | https://github.com/pinojs/pino                             |

REA's own dependencies and the components it vendors are listed in the package's
`THIRD_PARTY_NOTICES.md` and `licenses/` directory, installed in the image under
`/app/node_modules/rea-agents/`. Debian package copyright files are in
`/usr/share/doc/<package>/copyright` inside the image.

With `REA_INSTALL=ghidra`, the container downloads Ghidra 12.1.4 (Apache-2.0,
https://github.com/NationalSecurityAgency/ghidra) from its official release at
run time. Ghidra is not part of the image; its license and notices are in the
installed directory.

The integration tests download Appium's ApiDemos APK (Apache-2.0,
https://github.com/appium/android-apidemos) at test time; it is not part of the
image.
