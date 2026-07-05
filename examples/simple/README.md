# Simple Python Runtime Examples

This example uses the Datalayer Python client to:

1. List available environments
2. Create a runtime from the first environment
3. Execute `1 + 1`
4. Terminate the runtime

## Run

Context manager example:

```bash
python runtime_quickstart.py
```

No-context example:

```bash
python runtime_quickstart_nocontext.py
```

Make targets:

```bash
make quickstart
make quickstart-nocontext
```

## Notes

Set your Datalayer token before running:

```bash
export DATALAYER_API_KEY="your-token-here"
```
