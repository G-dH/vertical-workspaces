---
name: Bug report
about: Create a report to help us improve
title: "[BUG]"
labels: bug
assignees: ''

---

**Describe the bug**
A clear and concise description of what the bug is.

**Basic debug information**
 - Did disabling all other extensions help?
 - Did you find conflicting extension?

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**System:**
 - OS: [e.g. Fedora 38]
 - Version of V-Shell extension: [e.g. 25]
 - Source of installation: [e.g. extension.gnome.org, GitHub]
 - Other installed and enabled extensions: ...

**System log output**
open terminal, execute:
`journalctl /usr/bin/{gjs,gnome-shell} -fo cat`
reproduce the bug, copy the output from terminal if any.
