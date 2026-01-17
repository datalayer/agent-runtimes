#!/usr/bin/env python3

# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Test script to debug kernel client variable operations.
"""

import os

import pytest
from dotenv import load_dotenv

try:
    from agent_runtimes.client.client import DatalayerClient
    DATALAYER_CLIENT_AVAILABLE = True
except ImportError:
    DatalayerClient = None  # type: ignore
    DATALAYER_CLIENT_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not DATALAYER_CLIENT_AVAILABLE,
    reason="DatalayerClient not available in current agent_runtimes version"
)

load_dotenv()


def test_kernel_client() -> None:
    """Test kernel client variable operations"""
    print("Testing kernel client variable operations...")

    # Explicitly get token from env vars (CI sets TEST_DATALAYER_API_KEY or DATALAYER_API_KEY)
    token = os.getenv("DATALAYER_API_KEY") or os.getenv("TEST_DATALAYER_API_KEY")
    if not token:
        pytest.skip(
            "DATALAYER_API_KEY or TEST_DATALAYER_API_KEY environment variable not set"
        )

    client = DatalayerClient(token=token)
    with client.create_runtime(
        name="test-kernel-vars", environment="ai-env"
    ) as runtime:
        print(f"Runtime created: {runtime.uid}")

        # Test kernel info
        if runtime._kernel_client:
            try:
                kernel_info = runtime._kernel_client.kernel_info
                print(f"Kernel info: {kernel_info}")

                if kernel_info:
                    language_info = kernel_info.get("language_info", {})
                    print(f"Language info: {language_info}")
                    language_name = language_info.get("name")
                    print(f"Language name: {language_name}")

            except Exception as e:
                print(f"Failed to get kernel info: {e}")

        # Test if jupyter_mimetypes is available in the kernel
        print("\n--- Testing jupyter_mimetypes availability ---")
        try:
            result = runtime.execute_code(
                """
try:
    from jupyter_mimetypes import get_variable, set_variable
    print("jupyter_mimetypes is available")
    print(f"get_variable: {get_variable}")
    print(f"set_variable: {set_variable}")
except ImportError as e:
    print(f"jupyter_mimetypes is NOT available: {e}")
except Exception as e:
    print(f"Other error: {e}")
""",
                debug=True,
            )
            print(f"Mimetypes test result: {result}")
        except Exception as e:
            print(f"Mimetypes test failed: {e}")

        # Test simple code execution first
        print("\n--- Testing simple code execution ---")
        try:
            result = runtime.execute_code(
                "test_var = 42\nprint(f'Variable set: {test_var}')", debug=True
            )
            print(f"Execution result: {result}")
        except Exception as e:
            print(f"Code execution failed: {e}")

        # Test variable setting
        print("\n--- Testing variable setting ---")
        try:
            runtime.set_variable("my_test_var", 123)
            print("Variable set successfully")
        except Exception as e:
            print(f"Variable setting failed: {e}")

        # Test variable getting with debug
        print("\n--- Testing variable getting with debug ---")
        try:
            # First set a variable using direct code execution
            runtime.execute_code("debug_var = 'hello_world'")
            print("Set debug_var = 'hello_world' via code execution")

            # Now try to get it using get_variable with debug output
            result = runtime.execute_code(
                """
# Debug the get_variable snippet directly
import pickle
import base64
from IPython.display import display

name = "debug_var"
print(f"Looking for variable: {name}")
print(f"Available variables: {[k for k in globals().keys() if not k.startswith('_')]}")

if name in globals():
    var = globals()[name]
    print(f"Found variable {name} = {var}")
    try:
        # Try to pickle the variable
        pickled = pickle.dumps(var)
        encoded = base64.b64encode(pickled).decode('utf-8')
        print(f"Pickled and encoded: {encoded[:100]}...")
        display_data = {
            "application/x-datalayer-variable": {
                "data": encoded,
                "name": name,
                "type": str(type(var).__name__)
            }
        }
        print(f"Display data: {display_data}")
        display(display_data, raw=True)
    except Exception as e:
        print(f"Pickle failed: {e}")
        # If pickle fails, convert to string representation
        display({"text/plain": str(var)}, raw=True)
else:
    print(f"Variable '{name}' not found in globals")
""",
                debug=True,
            )

            # Test the actual get_variable method and inspect results
            print("\n--- Testing get_variable execution details ---")
            if runtime._kernel_client is None:
                raise RuntimeError("Kernel client is None")
            kernel_language = runtime._kernel_client.kernel_info.get(
                "language_info", {}
            ).get("name")
            print(f"Kernel language: {kernel_language}")

            from jupyter_kernel_client.snippets import SNIPPETS_REGISTRY

            snippet = SNIPPETS_REGISTRY.get_get_variable(kernel_language)
            formatted_snippet = snippet.format(name="debug_var")
            print(f"Get variable snippet:\n{formatted_snippet}")

            # Execute the snippet and inspect the full results
            if runtime._kernel_client is None:
                raise RuntimeError("Kernel client is None")
            results = runtime._kernel_client.execute(formatted_snippet, silent=True)
            print(f"Get variable results: {results}")
            print(f"Results status: {results['status']}")
            print(f"Results outputs: {results['outputs']}")
            for i, output in enumerate(results["outputs"]):
                print(f"Output {i}: {output}")
                if "data" in output:
                    print(f"  Data keys: {output['data'].keys()}")

            value = runtime.get_variable("debug_var")
            print(f"Retrieved debug_var using get_variable: {value}")
        except Exception as e:
            print(f"Variable getting debug failed: {e}")

        # Test variable getting
        print("\n--- Testing variable getting ---")
        try:
            value = runtime.get_variable("test_var")  # From the code execution above
            print(f"Retrieved test_var: {value}")
        except Exception as e:
            print(f"Variable getting failed: {e}")

        try:
            value = runtime.get_variable("my_test_var")  # From set_variable above
            print(f"Retrieved my_test_var: {value}")
        except Exception as e:
            print(f"Variable getting failed: {e}")


if __name__ == "__main__":
    test_kernel_client()
