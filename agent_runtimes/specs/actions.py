# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Action Classes.

What every tool does to the world: read, write, send, buy, delete, publish.
A tool with no class is unknown, and unknown is the most restricted.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Any, Dict, List

from agent_runtimes.types import ServerActionsSpec

#: The classes of action, from the one that changes nothing.
ACTION_CLASSES: List[str] = ["read", "write", "send", "buy", "delete", "publish"]

#: What each tool of the tools catalogue does, by id.
TOOL_ACTIONS: Dict[str, List[str]] = {
    "create-plan": ["read"],
    "current-time": ["read"],
    "display-recipe": ["read"],
    "example-create-plan": ["read"],
    "example-current-time": ["read"],
    "example-display-recipe": ["read"],
    "example-generate-haiku": ["read"],
    "example-generate-task-steps": ["read"],
    "example-get-weather": ["read"],
    "example-render-a2ui-surface": ["read"],
    "example-update-plan-step": ["read"],
    "generate-haiku": ["read"],
    "generate-task-steps": ["read"],
    "get-weather": ["read"],
    "runtime-echo": ["read"],
    "runtime-send-mail": ["send"],
    "runtime-sensitive-echo": ["read"],
    "update-plan-step": ["read"],
}

#: What each MCP server's tools do, by server id. `checked` is the day the
#: names were read off the running server, or None when nobody looked.
SERVER_ACTIONS: Dict[str, ServerActionsSpec] = {
    "alphavantage": ServerActionsSpec.model_validate(
        {"checked": None, "default": [], "tools": {}, "conditions": {}}
    ),
    "chart": ServerActionsSpec.model_validate(
        {
            "checked": "2026-10-02",
            "default": [],
            "tools": {
                "generate_area_chart": ["read"],
                "generate_bar_chart": ["read"],
                "generate_boxplot_chart": ["read"],
                "generate_column_chart": ["read"],
                "generate_district_map": ["read"],
                "generate_dual_axes_chart": ["read"],
                "generate_fishbone_diagram": ["read"],
                "generate_flow_diagram": ["read"],
                "generate_funnel_chart": ["read"],
                "generate_histogram_chart": ["read"],
                "generate_line_chart": ["read"],
                "generate_liquid_chart": ["read"],
                "generate_mind_map": ["read"],
                "generate_network_graph": ["read"],
                "generate_organization_chart": ["read"],
                "generate_path_map": ["read"],
                "generate_pie_chart": ["read"],
                "generate_pin_map": ["read"],
                "generate_radar_chart": ["read"],
                "generate_sankey_chart": ["read"],
                "generate_scatter_chart": ["read"],
                "generate_treemap_chart": ["read"],
                "generate_venn_chart": ["read"],
                "generate_violin_chart": ["read"],
                "generate_waterfall_chart": ["read"],
                "generate_word_cloud_chart": ["read"],
                "generate_spreadsheet": ["read"],
            },
            "conditions": {},
        }
    ),
    "datalayer": ServerActionsSpec.model_validate(
        {"checked": None, "default": [], "tools": {}, "conditions": {}}
    ),
    "earthdata": ServerActionsSpec.model_validate(
        {"checked": None, "default": [], "tools": {}, "conditions": {}}
    ),
    "eurus": ServerActionsSpec.model_validate(
        {"checked": None, "default": [], "tools": {}, "conditions": {}}
    ),
    "filesystem": ServerActionsSpec.model_validate(
        {
            "checked": "2026-10-02",
            "default": [],
            "tools": {
                "read_file": ["read"],
                "read_text_file": ["read"],
                "read_media_file": ["read"],
                "read_multiple_files": ["read"],
                "write_file": ["write"],
                "edit_file": ["write"],
                "create_directory": ["write"],
                "list_directory": ["read"],
                "list_directory_with_sizes": ["read"],
                "directory_tree": ["read"],
                "move_file": ["write", "delete"],
                "search_files": ["read"],
                "get_file_info": ["read"],
                "list_allowed_directories": ["read"],
            },
            "conditions": {},
        }
    ),
    "github": ServerActionsSpec.model_validate(
        {"checked": None, "default": [], "tools": {}, "conditions": {}}
    ),
    "google-workspace": ServerActionsSpec.model_validate(
        {
            "checked": "2026-10-02",
            "default": [],
            "tools": {
                "start_google_auth": ["write"],
                "search_gmail_messages": ["read"],
                "get_gmail_message_content": ["read"],
                "get_gmail_messages_content_batch": ["read"],
                "get_gmail_attachment_content": ["read", "write"],
                "send_gmail_message": ["send"],
                "draft_gmail_message": ["write"],
                "get_gmail_thread_content": ["read"],
                "get_gmail_threads_content_batch": ["read"],
                "list_gmail_labels": ["read"],
                "manage_gmail_label": ["write"],
                "list_gmail_filters": ["read"],
                "manage_gmail_filter": ["write", "send"],
                "modify_gmail_message_labels": ["write"],
                "batch_modify_gmail_message_labels": ["write"],
                "search_drive_files": ["read"],
                "get_drive_file_content": ["read"],
                "get_drive_file_download_url": ["read"],
                "list_drive_items": ["read"],
                "create_drive_folder": ["write"],
                "create_drive_file": ["write"],
                "import_to_google_doc": ["write"],
                "import_to_google_slides": ["write"],
                "import_to_google_sheets": ["write"],
                "get_drive_file_permissions": ["read"],
                "check_drive_file_public_access": ["read"],
                "update_drive_file": ["write"],
                "get_drive_shareable_link": ["read"],
                "manage_drive_access": ["publish", "send", "delete"],
                "copy_drive_file": ["write"],
                "set_drive_file_permissions": ["publish", "write"],
                "list_calendars": ["read"],
                "get_events": ["read"],
                "manage_event": ["write", "send"],
                "manage_out_of_office": ["write", "send"],
                "manage_focus_time": ["write", "send"],
                "query_freebusy": ["read"],
                "create_calendar": ["write"],
                "search_docs": ["read"],
                "get_doc_content": ["read"],
                "list_docs_in_folder": ["read"],
                "create_doc": ["write"],
                "modify_doc_text": ["write"],
                "find_and_replace_doc": ["write"],
                "insert_doc_elements": ["write"],
                "insert_doc_image": ["write"],
                "update_doc_headers_footers": ["write"],
                "batch_update_doc": ["write", "delete"],
                "inspect_doc_structure": ["read"],
                "debug_docs_runtime_info": ["read"],
                "create_table_with_data": ["write"],
                "debug_table_structure": ["read"],
                "export_doc_to_pdf": ["write"],
                "update_paragraph_style": ["write"],
                "get_doc_as_markdown": ["read"],
                "manage_doc_tab": ["write"],
                "list_document_comments": ["read"],
                "manage_document_comment": ["write", "send"],
                "list_spreadsheets": ["read"],
                "get_spreadsheet_info": ["read"],
                "read_sheet_values": ["read"],
                "modify_sheet_values": ["write"],
                "format_sheet_range": ["write"],
                "manage_conditional_formatting": ["write"],
                "create_spreadsheet": ["write"],
                "create_sheet": ["write"],
                "list_sheet_tables": ["read"],
                "append_table_rows": ["write"],
                "manage_sheet_tab": ["write"],
                "resize_sheet_dimensions": ["write", "delete"],
                "move_sheet_rows": ["write", "delete"],
                "manage_named_range": ["write"],
                "list_spreadsheet_comments": ["read"],
                "manage_spreadsheet_comment": ["write", "send"],
                "list_spaces": ["read"],
                "get_messages": ["read"],
                "send_message": ["send", "write"],
                "search_messages": ["read"],
                "create_reaction": ["send"],
                "download_chat_attachment": ["read", "write"],
                "create_form": ["write"],
                "get_form": ["read"],
                "set_publish_settings": ["publish"],
                "get_form_response": ["read"],
                "list_form_responses": ["read"],
                "batch_update_form": ["write", "delete"],
                "create_presentation": ["write"],
                "get_presentation": ["read"],
                "batch_update_presentation": ["write", "delete"],
                "get_page": ["read"],
                "get_page_thumbnail": ["read"],
                "list_presentation_comments": ["read"],
                "manage_presentation_comment": ["write", "send"],
                "list_task_lists": ["read"],
                "get_task_list": ["read"],
                "manage_task_list": ["write"],
                "list_tasks": ["read"],
                "get_task": ["read"],
                "manage_task": ["write"],
                "list_contacts": ["read"],
                "get_contact": ["read"],
                "search_contacts": ["read"],
                "manage_contact": ["write"],
                "list_contact_groups": ["read"],
                "get_contact_group": ["read"],
                "manage_contacts_batch": ["write"],
                "manage_contact_group": ["write"],
                "search_custom": ["read"],
                "get_search_engine_info": ["read"],
                "get_script_project": ["read"],
                "manage_script_content": ["write", "delete"],
                "run_script_function": ["write", "send", "delete", "publish"],
                "manage_deployment": ["publish"],
                "list_script_deployments": ["read"],
                "manage_script_project": ["write"],
                "manage_script_version": ["write"],
                "get_script_version": ["read"],
                "get_script_activity": ["read"],
                "generate_trigger_code": ["read"],
                "manage_script_trigger": ["write"],
            },
            "conditions": {
                "manage_gmail_label": [
                    {"argument": "action", "classes": ["delete"], "equals": ["delete"]}
                ],
                "manage_gmail_filter": [
                    {
                        "argument": "action",
                        "classes": ["delete"],
                        "equals": ["delete", "update"],
                    }
                ],
                "modify_gmail_message_labels": [
                    {
                        "argument": "add_label_ids",
                        "classes": ["delete"],
                        "includes": ["TRASH", "SPAM"],
                    }
                ],
                "batch_modify_gmail_message_labels": [
                    {
                        "argument": "add_label_ids",
                        "classes": ["delete"],
                        "includes": ["TRASH", "SPAM"],
                    }
                ],
                "update_drive_file": [
                    {"argument": "trashed", "classes": ["delete"], "equals": [True]}
                ],
                "manage_event": [
                    {"argument": "action", "classes": ["delete"], "equals": ["delete"]}
                ],
                "manage_out_of_office": [
                    {"argument": "action", "classes": ["delete"], "equals": ["delete"]}
                ],
                "manage_focus_time": [
                    {"argument": "action", "classes": ["delete"], "equals": ["delete"]}
                ],
                "manage_doc_tab": [
                    {"argument": "action", "classes": ["delete"], "equals": ["delete"]}
                ],
                "manage_conditional_formatting": [
                    {"argument": "action", "classes": ["delete"], "equals": ["delete"]}
                ],
                "manage_sheet_tab": [
                    {"argument": "action", "classes": ["delete"], "equals": ["delete"]}
                ],
                "manage_named_range": [
                    {"argument": "action", "classes": ["delete"], "equals": ["delete"]}
                ],
                "manage_task_list": [
                    {
                        "argument": "action",
                        "classes": ["delete"],
                        "equals": ["delete", "clear_completed"],
                    }
                ],
                "manage_task": [
                    {"argument": "action", "classes": ["delete"], "equals": ["delete"]}
                ],
                "manage_contact": [
                    {"argument": "action", "classes": ["delete"], "equals": ["delete"]}
                ],
                "manage_contacts_batch": [
                    {"argument": "action", "classes": ["delete"], "equals": ["delete"]}
                ],
                "manage_contact_group": [
                    {"argument": "action", "classes": ["delete"], "equals": ["delete"]}
                ],
                "manage_deployment": [
                    {"argument": "action", "classes": ["delete"], "equals": ["delete"]}
                ],
                "manage_script_project": [
                    {"argument": "action", "classes": ["delete"], "equals": ["delete"]}
                ],
                "manage_script_trigger": [
                    {"argument": "action", "classes": ["delete"], "equals": ["delete"]}
                ],
            },
        }
    ),
    "huggingface": ServerActionsSpec.model_validate(
        {"checked": None, "default": [], "tools": {}, "conditions": {}}
    ),
    "kaggle": ServerActionsSpec.model_validate(
        {"checked": None, "default": [], "tools": {}, "conditions": {}}
    ),
    "odoo": ServerActionsSpec.model_validate(
        {"checked": None, "default": [], "tools": {}, "conditions": {}}
    ),
    "salesforce": ServerActionsSpec.model_validate(
        {"checked": None, "default": [], "tools": {}, "conditions": {}}
    ),
    "slack": ServerActionsSpec.model_validate(
        {
            "checked": "2026-10-02",
            "default": [],
            "tools": {
                "slack_list_channels": ["read"],
                "slack_post_message": ["send"],
                "slack_reply_to_thread": ["send"],
                "slack_add_reaction": ["send"],
                "slack_get_channel_history": ["read"],
                "slack_get_thread_replies": ["read"],
                "slack_get_users": ["read"],
                "slack_get_user_profile": ["read"],
            },
            "conditions": {},
        }
    ),
    "tavily": ServerActionsSpec.model_validate(
        {
            "checked": "2026-10-02",
            "default": [],
            "tools": {
                "tavily_search": ["read"],
                "tavily_extract": ["read"],
                "tavily_crawl": ["read"],
                "tavily_map": ["read"],
                "tavily_research": ["read"],
            },
            "conditions": {},
        }
    ),
}

#: What each application of the catalogue does about each classed tool of the
#: servers it connects to, as agentspecs decides it: `do_it`, `if_asked`,
#: `ask_first` or `leave_to_me`. What the rules engine has to reproduce.
APP_BEHAVIOURS: Dict[str, Dict[str, str]] = {
    "inbox-triage": {
        "google-workspace.append_table_rows": "leave_to_me",
        "google-workspace.batch_modify_gmail_message_labels": "do_it",
        "google-workspace.batch_update_doc": "leave_to_me",
        "google-workspace.batch_update_form": "leave_to_me",
        "google-workspace.batch_update_presentation": "leave_to_me",
        "google-workspace.check_drive_file_public_access": "leave_to_me",
        "google-workspace.copy_drive_file": "leave_to_me",
        "google-workspace.create_calendar": "leave_to_me",
        "google-workspace.create_doc": "leave_to_me",
        "google-workspace.create_drive_file": "leave_to_me",
        "google-workspace.create_drive_folder": "leave_to_me",
        "google-workspace.create_form": "leave_to_me",
        "google-workspace.create_presentation": "leave_to_me",
        "google-workspace.create_reaction": "leave_to_me",
        "google-workspace.create_sheet": "leave_to_me",
        "google-workspace.create_spreadsheet": "leave_to_me",
        "google-workspace.create_table_with_data": "leave_to_me",
        "google-workspace.debug_docs_runtime_info": "leave_to_me",
        "google-workspace.debug_table_structure": "leave_to_me",
        "google-workspace.download_chat_attachment": "leave_to_me",
        "google-workspace.draft_gmail_message": "do_it",
        "google-workspace.export_doc_to_pdf": "leave_to_me",
        "google-workspace.find_and_replace_doc": "leave_to_me",
        "google-workspace.format_sheet_range": "leave_to_me",
        "google-workspace.generate_trigger_code": "leave_to_me",
        "google-workspace.get_contact": "leave_to_me",
        "google-workspace.get_contact_group": "leave_to_me",
        "google-workspace.get_doc_as_markdown": "leave_to_me",
        "google-workspace.get_doc_content": "leave_to_me",
        "google-workspace.get_drive_file_content": "leave_to_me",
        "google-workspace.get_drive_file_download_url": "leave_to_me",
        "google-workspace.get_drive_file_permissions": "leave_to_me",
        "google-workspace.get_drive_shareable_link": "leave_to_me",
        "google-workspace.get_events": "leave_to_me",
        "google-workspace.get_form": "leave_to_me",
        "google-workspace.get_form_response": "leave_to_me",
        "google-workspace.get_gmail_attachment_content": "ask_first",
        "google-workspace.get_gmail_message_content": "do_it",
        "google-workspace.get_gmail_messages_content_batch": "do_it",
        "google-workspace.get_gmail_thread_content": "do_it",
        "google-workspace.get_gmail_threads_content_batch": "do_it",
        "google-workspace.get_messages": "leave_to_me",
        "google-workspace.get_page": "leave_to_me",
        "google-workspace.get_page_thumbnail": "leave_to_me",
        "google-workspace.get_presentation": "leave_to_me",
        "google-workspace.get_script_activity": "leave_to_me",
        "google-workspace.get_script_project": "leave_to_me",
        "google-workspace.get_script_version": "leave_to_me",
        "google-workspace.get_search_engine_info": "leave_to_me",
        "google-workspace.get_spreadsheet_info": "leave_to_me",
        "google-workspace.get_task": "leave_to_me",
        "google-workspace.get_task_list": "leave_to_me",
        "google-workspace.import_to_google_doc": "leave_to_me",
        "google-workspace.import_to_google_sheets": "leave_to_me",
        "google-workspace.import_to_google_slides": "leave_to_me",
        "google-workspace.insert_doc_elements": "leave_to_me",
        "google-workspace.insert_doc_image": "leave_to_me",
        "google-workspace.inspect_doc_structure": "leave_to_me",
        "google-workspace.list_calendars": "leave_to_me",
        "google-workspace.list_contact_groups": "leave_to_me",
        "google-workspace.list_contacts": "leave_to_me",
        "google-workspace.list_docs_in_folder": "leave_to_me",
        "google-workspace.list_document_comments": "leave_to_me",
        "google-workspace.list_drive_items": "leave_to_me",
        "google-workspace.list_form_responses": "leave_to_me",
        "google-workspace.list_gmail_filters": "do_it",
        "google-workspace.list_gmail_labels": "do_it",
        "google-workspace.list_presentation_comments": "leave_to_me",
        "google-workspace.list_script_deployments": "leave_to_me",
        "google-workspace.list_sheet_tables": "leave_to_me",
        "google-workspace.list_spaces": "leave_to_me",
        "google-workspace.list_spreadsheet_comments": "leave_to_me",
        "google-workspace.list_spreadsheets": "leave_to_me",
        "google-workspace.list_task_lists": "leave_to_me",
        "google-workspace.list_tasks": "leave_to_me",
        "google-workspace.manage_conditional_formatting": "leave_to_me",
        "google-workspace.manage_contact": "leave_to_me",
        "google-workspace.manage_contact_group": "leave_to_me",
        "google-workspace.manage_contacts_batch": "leave_to_me",
        "google-workspace.manage_deployment": "leave_to_me",
        "google-workspace.manage_doc_tab": "leave_to_me",
        "google-workspace.manage_document_comment": "leave_to_me",
        "google-workspace.manage_drive_access": "leave_to_me",
        "google-workspace.manage_event": "leave_to_me",
        "google-workspace.manage_focus_time": "leave_to_me",
        "google-workspace.manage_gmail_filter": "ask_first",
        "google-workspace.manage_gmail_label": "ask_first",
        "google-workspace.manage_named_range": "leave_to_me",
        "google-workspace.manage_out_of_office": "leave_to_me",
        "google-workspace.manage_presentation_comment": "leave_to_me",
        "google-workspace.manage_script_content": "leave_to_me",
        "google-workspace.manage_script_project": "leave_to_me",
        "google-workspace.manage_script_trigger": "leave_to_me",
        "google-workspace.manage_script_version": "leave_to_me",
        "google-workspace.manage_sheet_tab": "leave_to_me",
        "google-workspace.manage_spreadsheet_comment": "leave_to_me",
        "google-workspace.manage_task": "leave_to_me",
        "google-workspace.manage_task_list": "leave_to_me",
        "google-workspace.modify_doc_text": "leave_to_me",
        "google-workspace.modify_gmail_message_labels": "do_it",
        "google-workspace.modify_sheet_values": "leave_to_me",
        "google-workspace.move_sheet_rows": "leave_to_me",
        "google-workspace.query_freebusy": "leave_to_me",
        "google-workspace.read_sheet_values": "leave_to_me",
        "google-workspace.resize_sheet_dimensions": "leave_to_me",
        "google-workspace.run_script_function": "leave_to_me",
        "google-workspace.search_contacts": "leave_to_me",
        "google-workspace.search_custom": "leave_to_me",
        "google-workspace.search_docs": "leave_to_me",
        "google-workspace.search_drive_files": "leave_to_me",
        "google-workspace.search_gmail_messages": "do_it",
        "google-workspace.search_messages": "leave_to_me",
        "google-workspace.send_gmail_message": "ask_first",
        "google-workspace.send_message": "leave_to_me",
        "google-workspace.set_drive_file_permissions": "leave_to_me",
        "google-workspace.set_publish_settings": "leave_to_me",
        "google-workspace.start_google_auth": "leave_to_me",
        "google-workspace.update_doc_headers_footers": "leave_to_me",
        "google-workspace.update_drive_file": "leave_to_me",
        "google-workspace.update_paragraph_style": "leave_to_me",
    },
    "quote-calculator": {},
    "ship-or-fix": {},
    "web-research": {
        "tavily.tavily_crawl": "do_it",
        "tavily.tavily_extract": "do_it",
        "tavily.tavily_map": "do_it",
        "tavily.tavily_research": "do_it",
        "tavily.tavily_search": "do_it",
    },
}

#: Where what a tool is asked changes what an application does about it: by
#: application and tool, each condition and the behaviour when it holds.
APP_ESCALATIONS: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
    "inbox-triage": {
        "google-workspace.batch_modify_gmail_message_labels": [
            {
                "argument": "add_label_ids",
                "classes": ["delete"],
                "includes": ["TRASH", "SPAM"],
                "behaviour": "leave_to_me",
            }
        ],
        "google-workspace.manage_gmail_filter": [
            {
                "argument": "action",
                "classes": ["delete"],
                "equals": ["delete", "update"],
                "behaviour": "leave_to_me",
            }
        ],
        "google-workspace.manage_gmail_label": [
            {
                "argument": "action",
                "classes": ["delete"],
                "equals": ["delete"],
                "behaviour": "leave_to_me",
            }
        ],
        "google-workspace.modify_gmail_message_labels": [
            {
                "argument": "add_label_ids",
                "classes": ["delete"],
                "includes": ["TRASH", "SPAM"],
                "behaviour": "leave_to_me",
            }
        ],
    },
    "quote-calculator": {},
    "ship-or-fix": {},
    "web-research": {},
}
