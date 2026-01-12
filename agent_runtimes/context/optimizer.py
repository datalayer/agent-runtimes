# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

import os
import json

from pydantic_ai import Agent, messages as _messages


os.environ['OLLAMA_BASE_URL'] = 'http://localhost:11434/v1'

agent = Agent('ollama:gemma3:1b-it-qat', instructions='Be concise, reply with one sentence.')


def print_message_content(part):
    """Helper to extract and print message part content."""
    if hasattr(part, 'content'):
        return part.content
    elif hasattr(part, 'tool_name'):
        return f"Tool: {part.tool_name}, Args: {part.args}"
    else:
        return str(part)


def calculate_message_size(msg):
    """Calculate the total size in bytes of a message."""
    total_size = 0
    if hasattr(msg, 'parts'):
        for part in msg.parts:
            content = print_message_content(part)
            if isinstance(content, str):
                total_size += len(content.encode('utf-8'))
            elif isinstance(content, bytes):
                total_size += len(content)
            else:
                total_size += len(str(content).encode('utf-8'))
    return total_size


def print_request_details(result, turn_number):
    """Print detailed request information."""
    print(f"\n{'='*80}")
    print(f"🔷 TURN {turn_number} - REQUEST")
    print(f"{'='*80}")
    
    all_messages = result.all_messages()
    new_messages = result.new_messages()
    
    # Show new messages for this turn
    print(f"\n� New Messages in This Turn ({len(new_messages)} messages):")
    for i, msg in enumerate(new_messages):
        msg_size = calculate_message_size(msg)
        print(f"\n  [{i+1}] {type(msg).__name__} ({msg_size} bytes)")
        if hasattr(msg, 'parts'):
            for j, part in enumerate(msg.parts):
                content = print_message_content(part)
                print(f"      • {part.part_kind}: {content}")
    
    # Show complete conversation context
    print(f"\n📦 Complete Conversation Context ({len(all_messages)} total messages):")
    for i, msg in enumerate(all_messages):
        msg_size = calculate_message_size(msg)
        print(f"\n  [{i+1}] {type(msg).__name__} ({msg_size} bytes)")
        if hasattr(msg, 'parts'):
            for j, part in enumerate(msg.parts):
                content = print_message_content(part)
                print(f"      • {part.part_kind}: {content}")
    
    total_size = sum(calculate_message_size(msg) for msg in all_messages)
    print(f"\n  💾 Total conversation size: {total_size} bytes")
    
    # Show raw JSON payload
    print(f"\n{'─'*80}")
    print(f"📄 RAW PAYLOAD (JSON format):")
    print(f"{'─'*80}")
    try:
        messages_json = _messages.ModelMessagesTypeAdapter.dump_json(all_messages)
        messages_dict = json.loads(messages_json)
        print(json.dumps(messages_dict, indent=2))
    except Exception as e:
        print(f"Could not serialize to JSON: {e}")


def print_response_details(result, turn_number):
    """Print detailed response information."""
    print(f"\n{'='*80}")
    print(f"📥 TURN {turn_number} - RESPONSE")
    print(f"{'='*80}")
    
    print(f"\n✅ Output: {result.output}")
    print(f"📊 Usage: {result.usage()}")
    
    # Get model name from the last response message
    all_messages = result.all_messages()
    if all_messages:
        for msg in reversed(all_messages):
            if hasattr(msg, 'model_name'):
                print(f"🤖 Model: {msg.model_name}")
                break
    
    # Show response message
    all_messages = result.all_messages()
    if all_messages:
        response_msg = all_messages[-1]  # Last message is the response
        response_size = calculate_message_size(response_msg)
        print(f"💾 Response size: {response_size} bytes")


def main():
    print("\n" + "="*80)
    print("� STARTING MULTI-TURN CONVERSATION")
    print("="*80)
    
    # First run
    print("\n" + "🔵"*40)
    print("FIRST QUESTION")
    print("🔵"*40)
    
    result1 = agent.run_sync('Who was Albert Einstein?')
    print_request_details(result1, 1)
    print_response_details(result1, 1)
    
    # Second run, passing previous messages
    print("\n" + "🔵"*40)
    print("SECOND QUESTION (with message history)")
    print("🔵"*40)
    
    result2 = agent.run_sync(
        'What was his most famous equation?',
        message_history=result1.new_messages(),
    )
    print_request_details(result2, 2)
    print_response_details(result2, 2)
    
    # Third run to show growing context
    print("\n" + "🔵"*40)
    print("THIRD QUESTION (with accumulated history)")
    print("🔵"*40)
    
    result3 = agent.run_sync(
        'When did he develop it?',
        message_history=result2.new_messages(),
    )
    print_request_details(result3, 3)
    print_response_details(result3, 3)
    
    print("\n" + "="*80)
    print("✅ CONVERSATION COMPLETE")
    print("="*80)
    print(f"\nFinal conversation had {len(result3.all_messages())} messages total")
    print(f"Total context size: {sum(calculate_message_size(msg) for msg in result3.all_messages())} bytes\n")


if __name__ == '__main__':
    main()
