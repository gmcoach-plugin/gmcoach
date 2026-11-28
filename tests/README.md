# Tests

Tests live here, next to `plugin/`, so marketplace installs (`source: ./plugin`) do not copy them to users.
Run from the repository root with Node.js 24:

```
npm test
node --test tests/runtime-bootstrap.test.mjs
```

Test files import code from `../plugin/`.
