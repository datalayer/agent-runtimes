/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Standard Catalog.
 *
 * The standards a conformance report answers (SH-60).
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { StandardControl, StandardSpec } from '../types/agentspecs';

export const AIUC_1_STANDARD: StandardSpec = {
  id: 'aiuc-1',
  version: '2026.4',
  name: 'AIUC-1',
  description:
    "The AI agent standard of the Artificial Intelligence Underwriting Company: six principles — data and privacy, security, safety, reliability, accountability, society — each a set of requirements with core and supplemental controls, mandatory or optional, updated each quarter and certified against a version locked for the certification's year.",
  enabled: true,
  tags: ['standard', 'aiuc-1', 'agents', 'certification'],
  publishedBy: 'AIUC (Artificial Intelligence Underwriting Company)',
  url: 'https://standard.aiuc-1.com',
  releasedOn: '2026-10-15',
  nextReleaseOn: '2027-01-15',
  readOn: '2026-10-15',
  certificateValidMonths: 12,
  mapsTo: null,
  evidenceKinds: {
    documentation:
      'Policies, contracts, plans and procedures a person wrote and signed.',
    config: 'Code and settings that implement a control, as they run.',
    logs: 'Audit trails and monitoring: what the system recorded as it ran.',
    evals: "A third party's evaluation report, on the standard's cadence.",
    report: 'A report the organization publishes or records.',
    demonstration:
      'A screen, a notice, a walkthrough: the control seen working.',
  },
  frameworks: {
    'eu-ai-act': 'EU AI Act',
    'nist-ai-rmf': 'NIST AI RMF',
    'iso-42001': 'ISO/IEC 42001',
    'mitre-atlas': 'MITRE ATLAS',
    'owasp-top-10': 'OWASP Top 10 for LLM Applications',
    'owasp-agentic-top-10': 'OWASP Top 10 for Agentic Applications',
    'owasp-aivss': 'OWASP AIVSS',
    'csa-aicm': 'CSA AICM',
    'soc-2': 'SOC 2',
    'ibm-ai-risk-atlas': 'IBM AI Risk Atlas',
    'cisco-ai-security-safety-framework':
      'Cisco AI Security & Safety Framework',
    'co-ai-act': 'Colorado AI Act',
    'ca-sb-53': 'California SB 53',
    'nyc-ll-144': 'NYC Local Law 144',
  },
  domains: [
    {
      id: 'A',
      name: 'Data & Privacy',
      url: 'https://standard.aiuc-1.com/data-and-privacy',
    },
    {
      id: 'B',
      name: 'Security',
      url: 'https://standard.aiuc-1.com/security',
    },
    {
      id: 'C',
      name: 'Safety',
      url: 'https://standard.aiuc-1.com/safety',
    },
    {
      id: 'D',
      name: 'Reliability',
      url: 'https://standard.aiuc-1.com/reliability',
    },
    {
      id: 'E',
      name: 'Accountability',
      url: 'https://standard.aiuc-1.com/accountability',
    },
    {
      id: 'F',
      name: 'Society',
      url: 'https://standard.aiuc-1.com/society',
    },
  ],
  controls: [
    {
      id: 'A001',
      title: 'Establish input data policy',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/data-and-privacy/establish-data-use-policy',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Establish and communicate AI input data policies covering how customer data is used for model training, inference processing, data retention periods, and customer data rights.',
      keywords: ['Data Retention', 'Model Training Data', 'Opt-Out'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Defining and communicating input data usage policies. Including specifying how customer data is used for inference and model training, establishing data retention periods, and documenting customer data rights.',
        },
        {
          required: 'core',
          activity:
            'Implementing technical controls to enforce data retention and deletion policies. For example, automating data deletion based on retention schedules, using secure removal mechanisms, and managing data lifecycles.',
        },
        {
          required: 'supplemental',
          activity:
            'Documenting processes for handling end-user data subject rights. For example, handling requests for opt-in/opt-out rights, access, portability, or deletion of input data.',
        },
      ],
      evidence: [
        {
          id: 'A001.1',
          kind: 'documentation',
          title: 'Policy for input data ownership, usage and retention',
          required: 'core',
          category: 'legal-policies',
          locations: ['Terms of Service', 'Privacy Policy', 'DPA', 'Universal'],
          description:
            'Typically demonstrated by Terms of Service, Privacy Policy or Data Processing Agreement',
        },
        {
          id: 'A001.2',
          kind: 'config',
          title: 'Data retention implementation',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Engineering Practice', 'Universal'],
          description:
            'Implementation of automated deletion schedule or data lifecycle system - may include cron job or scheduled task deleting expired data, deletion script in Python/Bash with retention period logic, data lifecycle management tool configuration (e.g., AWS S3 lifecycle rules, database TTL settings), or deletion audit logs from database or storage system.',
        },
        {
          id: 'A001.3',
          kind: 'documentation',
          title: 'Data subject right processes',
          required: 'supplemental',
          category: 'legal-policies',
          locations: [
            'Data Processing Agreement',
            'Privacy Policy',
            'Universal',
          ],
          description:
            'May be included in DPA, GDPR appendix, External Privacy Policy or similar internal or external policies documenting processes for data handling',
        },
      ],
      crosswalks: {
        'eu-ai-act': ['Article 11: Technical Documentation'],
        'iso-42001': [
          'A.7.2: Data for development and enhancement of AI system',
          'A.7.3: Acquisition of data',
        ],
        'nist-ai-rmf': ['MEASURE 2.10: Privacy risk assessment'],
        'csa-aicm': [
          'DSP-11: Personal Data Access, Reversal, Rectification and Deletion',
          'DSP-12: Limitation of Purpose in Personal Data Processing',
          'DSP-13: Personal Data Sub-processing',
          'DSP-14: Disclosure of Data Sub-processors',
          'DSP-15: Limitation of Production Data Use',
          'DSP-16: Data Retention and Deletion',
          'DSP-09: Data Protection Impact Assessment',
          'DSP-20: Data Provenance and Transparency',
          'DSP-23: Data Integrity Check',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 32: Training Data - Data privacy rights alignment',
          'IBM 35: Training Data - Data acquisition restrictions',
          'IBM 36: Training Data - Data usage restrictions',
          'IBM 79: Non-Technical - Lack of data transparency',
        ],
        'nyc-ll-144': ['5-302: Manage Audit Data', '5-304: Provide Notice'],
        'co-ai-act': ['6-1-1702: Developer Duties'],
        'soc-2': [
          'C1.1: Identify and maintain confidential information',
          'C1.2: Dispose of confidential information',
          'CC5.3: Deploy controls through policies',
          'P1.1: Privacy notice to data subjects',
          'P2.1: Choice and consent',
          'P3.1: Consistent collection of personal information',
          'P3.2: Explicit consent before collection',
          'P4.1: Limit use of personal information',
          'P4.2: Retention of personal information',
          'P5.1: Data subject access rights',
          'P6.1: Disclosure with consent',
          'PI1.2: Input completeness and accuracy',
          'PI1.5: Storage completeness and accuracy',
        ],
      },
    },
    {
      id: 'A002',
      title: 'Establish output data policy',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/data-and-privacy/define-output-rights',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Establish AI output ownership, usage, opt-in/out and deletion policies to customers and communicate these policies.',
      keywords: ['Data Ownership', 'Usage', 'Deletion', 'Consent', 'Opt-Out'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Establishing output ownership and usage rights policies. For example, specifying customer ownership of AI-generated outputs versus AI inputs, defining permitted uses of outputs (commercial use, redistribution, modification), documenting usage restrictions or limitations, and clarifying how ownership applies to different output types or use cases.',
        },
        {
          required: 'core',
          activity:
            'Disclosing opt-in/opt-out and deletion policies for AI outputs. For example, documenting how customers can opt out of output storage or reuse, explaining deletion request processes, specifying retention periods and data handling practices, and clarifying how customers can control or revoke permissions for their outputs.',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing technical controls to enforce AI output opt-in/opt-out and deletion policies. For example, automating customer preference enforcement through consent management configuration, processing opt-out and deletion requests within defined workflows, and validating that opted-out outputs are excluded from storage and downstream reuse.',
        },
      ],
      evidence: [
        {
          id: 'A002.1',
          kind: 'documentation',
          title: 'Output usage and ownership policy',
          required: 'core',
          category: 'legal-policies',
          locations: ['Terms of Service', 'Universal'],
          description:
            'Typically demonstrated by Terms of Service, Data Processing Agreement, Master Service Agreement, Privacy Policy, or AI Addendum. May be a combination of these policies.',
        },
        {
          id: 'A002.2',
          kind: 'config',
          title: 'Opt-in/opt-out and output deletion implementation',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Engineering Practice', 'Universal'],
          description:
            'Implementation of opt-in/opt-out enforcement mechanism or output deletion workflow - may include consent management system enforcing customer preferences (e.g., feature flag gating output storage, consent database linked to processing pipeline), opt-out or deletion request processing script or automated task, or audit logs from consent and deletion systems with timestamps and execution records.',
        },
      ],
      crosswalks: {
        'csa-aicm': [
          'DSP-16: Data Retention and Deletion',
          'DSP-08: Data Privacy by Design and Default',
          'STA-10: Primary Service and Contractual Agreement',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 32: Training Data - Data privacy rights alignment',
          'IBM 90: Non-Technical - Generated content ownership and IP',
        ],
        'soc-2': [
          'C1.2: Dispose of confidential information',
          'CC5.3: Deploy controls through policies',
          'P1.1: Privacy notice to data subjects',
          'P2.1: Choice and consent',
          'P3.1: Consistent collection of personal information',
          'P3.2: Explicit consent before collection',
          'P6.1: Disclosure with consent',
          'PI1.4: Output delivery accuracy',
          'PI1.5: Storage completeness and accuracy',
        ],
      },
    },
    {
      id: 'A003',
      title: 'Limit AI agent data access',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/data-and-privacy/implement-contextual-data-safeguards',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement safeguards to limit AI agent data access based on task, user role, agent role and context.',
      keywords: [
        'Data Collection',
        'Data Access',
        'Agent Permissions',
        'Access Permissions',
      ],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Configuring data access limits to reduce data and privacy exposure. For example, limiting data access to task-relevant information based on context, implementing scoping based on user roles or workflow requirements, and avoiding persistent or out-of-scope data access.',
        },
        {
          required: 'supplemental',
          activity:
            "Enabling agent identity management. For example, assigning each agent a unique, cryptographically verifiable identity; supporting standard identity federation protocols (e.g., OAuth 2.0, OIDC) for enterprise IAM integration; publishing agent cards declaring each agent's capabilities, tools, and permission scopes.",
        },
        {
          required: 'supplemental',
          activity:
            'Enabling agent access and governance through permission-ready architecture. For example, exposing per-agent permission scopes mappable to enterprise roles; supporting just-in-time permissions scoped to specific subtasks; preventing silent inheritance of elevated permissions from orchestrators or parent agents; enforcing segregation of duties across systems; and integrating data loss prevention controls on agent actions and tool calls.',
        },
      ],
      evidence: [
        {
          id: 'A003.1',
          kind: 'config',
          title: 'Data access scoping',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            'Code implementing data access restrictions - may include RAG retrieval function with document filtering logic, session scoping configuration limiting data access per session ID, workflow conditional logic gating data collection by stage, permission decorators or middleware checking user roles before data access, or scoping functions rejecting out-of-scope queries with error messages.',
        },
        {
          id: 'A003.2',
          kind: 'config',
          title: 'Agent identity management',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            'Documentation showing how identity governance is enabled - may include platform configuration showing unique, cryptographically verifiable identity assignment per agent instance, API or SDK documentation for identity federation endpoints (e.g., OIDC token exchange), or a sample agent card declaring agent capabilities and scopes.',
        },
        {
          id: 'A003.3',
          kind: 'config',
          title: 'Agent access and permissions management',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            'Documentation showing how permission governance is enabled - may include API or SDK documentation for permission scope configuration mappable to RBAC or ABAC policies, platform settings or code demonstrating just-in-time credential issuance scoped to individual subtasks or tool calls, architecture documentation showing how inherited permission chains from orchestrators or parent agents are bounded or surfaced for review, a segregation of duties matrix identifying and preventing conflicting agent permission combinations across integrated systems, or DLP policy configuration showing inspection and blocking rules applied to outbound data transmitted through agent actions or tool calls.',
        },
      ],
      crosswalks: {
        'nist-ai-rmf': ['MAP 2.1: Task definition'],
        'owasp-top-10': [
          'LLM06:25 - Excessive Agency',
          'LLM08:25 - Vector and Embedding Weaknesses',
          'LLM10:25 - Unbounded Consumption',
        ],
        'csa-aicm': [
          'DSP-07: Data Protection by Design and Default',
          'AIS-11: Agents Security Boundaries',
          'DSP-08: Data Privacy by Design and Default',
          'DSP-22: Privacy Enhancing Technologies',
          'IAM-17: Knowledge Access Control - Need to Know',
          'IAM-19: Agent Access Restriction',
          'MDS-04: Model Documentation Requirements',
        ],
        'owasp-aivss': ['Agent Access Control Violation'],
        'ibm-ai-risk-atlas': [
          'IBM 2: Agentic AI - Sharing IP/PI/confidential information with user',
          'IBM 3: Agentic AI - Sharing IP/PI/confidential information with tools',
          'IBM 35: Training Data - Data acquisition restrictions',
          'IBM 55: Inference - Personal information in prompt',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-3.1: Masquerading / Obfuscation / Impersonation',
          'AITech-4.2: Context Boundary Attacks',
          'AITech-14.2: Abuse of Delegated Authority',
        ],
        'owasp-agentic-top-10': [
          'ASI02 - Tool Misuse and Exploitation',
          'ASI06 - Memory and Context Poisoning',
        ],
        'soc-2': [
          'CC6.1: Logical access security',
          'CC6.3: Role-based access management',
          'P4.1: Limit use of personal information',
        ],
      },
    },
    {
      id: 'A004',
      title: 'Protect IP & trade secrets',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/data-and-privacy/protect-ip-trade-secrets',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement safeguards or technical controls to prevent AI systems from leaking company intellectual property or confidential information.',
      keywords: [
        'Intellectual Property',
        'Confidential Information',
        'Data Protections',
      ],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Providing user guidance on protecting confidential information. For example, instructing employees not to input trade secrets, proprietary code, or confidential business information into AI systems, communicating data handling policies for AI tool usage, or establishing clear guidelines on what information can and cannot be shared with AI agents.',
        },
        {
          required: 'supplemental',
          activity:
            'Leveraging foundation model provider protections. For example, using providers with zero data retention policies, requiring contractual commitments that inputs are not used for training, selecting models with enhanced privacy guarantees for sensitive use cases.',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing technical controls to detect proprietary information in outputs.',
        },
        {
          required: 'supplemental',
          activity:
            'Establishing output monitoring for high-risk IP scenarios. For example, logging AI responses that accessed confidential data sources, implementing human review workflows for outputs flagged as potentially containing sensitive information.',
        },
      ],
      evidence: [
        {
          id: 'A004.1',
          kind: 'documentation',
          title: 'User guidance on confidential information',
          required: 'core',
          category: 'operational-practices',
          locations: ['Product', 'Universal'],
          description:
            'Policy document, training materials, or user guidelines instructing users on protecting confidential information when using AI systems.',
        },
        {
          id: 'A004.2',
          kind: 'documentation',
          title: 'foundational model IP protections',
          required: 'supplemental',
          category: 'legal-policies',
          locations: ['Vendor Contracts', 'Universal'],
          description:
            "Provider contracts, terms of service, or documentation showing IP protection commitments. Often found in third party's terms of use/service, DPA or AI Addendum/Schedule.",
        },
        {
          id: 'A004.3',
          kind: 'config',
          title: 'IP detection implementation',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Product', 'Universal'],
          description:
            'Code or configuration detecting proprietary information patterns in AI outputs - may include labelling proprietary files, filtering rules for internal identifiers/data labels/API keys, scanning logic for trade secret terminology, or rejection demonstrations showing appropriate responses to proprietary requests.',
        },
        {
          id: 'A004.4',
          kind: 'config',
          title: 'IP disclosure monitoring',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Practice', 'Logs', 'Universal'],
          description:
            'Logs, audit trails, or review workflow documentation for AI outputs potentially containing sensitive information - may include logs of responses accessing confidential sources, flagged output review queues, or human approval workflows for high-risk disclosures.',
        },
      ],
      crosswalks: {
        'mitre-atlas': ['AML-M0020: Generative AI Guardrails'],
        'eu-ai-act': [
          'Article 72: Post-Market Monitoring by Providers and Post-Market Monitoring Plan for High-Risk AI Systems',
        ],
        'owasp-top-10': [
          'LLM03:25 - Supply Chain',
          'LLM05:25 - Improper Output Handling',
          'LLM08:25 - Vector and Embedding Weaknesses',
        ],
        'csa-aicm': [
          'DSP-01: Security and Privacy Policy and Procedures',
          'DSP-10: Sensitive Data Transfer',
          'DSP-02: Secure Disposal',
          'DSP-07: Data Protection by Design and Default',
          'DSP-08: Data Privacy by Design and Default',
          'DSP-16: Data Retention and Deletion',
          'UEM-08: Storage Encryption',
          'DSP-12: Limitation of Purpose in Personal Data Processing',
        ],
        'owasp-aivss': ['Insecure Agent Critical Systems Interaction'],
        'cisco-ai-security-safety-framework': [
          'AITech-8.1: Membership Inference',
          'AITech-8.2: Data Exfiltration / Exposure',
          'AITech-8.3: Information Disclosure',
          'AITech-8.4: Prompt/Meta Extraction',
          'AITech-12.2: Insecure Output Handling',
          'AITech-15.1: Harmful Content',
        ],
        'soc-2': [
          'C1.1: Identify and maintain confidential information',
          'P4.1: Limit use of personal information',
        ],
      },
    },
    {
      id: 'A005',
      title: 'Prevent cross-customer data exposure',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/data-and-privacy/prevent-cross-customer-data-exposure',
      cadence_months: 12,
      type: 'preventative',
      summary: 'Implement safeguards to prevent cross-customer data exposure.',
      keywords: ['Cross-Customer Data', 'Model Training', 'Data Rights'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Establishing explicit consent and disclosure for combined data usage. For example, informing customers when their data will be combined with competitor data, disclosing data anonymization and abstraction policies, providing opt-out mechanisms.',
        },
        {
          required: 'core',
          activity:
            'Implementing customer data isolation controls. For example, enforcing strict logical and physical separation of customer data, applying tenant-specific encryption, validating data flow boundaries in shared infrastructure, establishing technical barriers between customer datasets during training.',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing specific privacy-enhancing technologies (PETs) to reduce competitive exposure.',
        },
      ],
      evidence: [
        {
          id: 'A005.1',
          kind: 'documentation',
          title: 'Consent for combined data usage',
          required: 'core',
          category: 'legal-policies',
          locations: [
            'Data Processing Agreement',
            'Terms of Service',
            'Universal',
          ],
          description:
            'Typically demonstrated by Data Processing Agreement or Terms of Service',
        },
        {
          id: 'A005.2',
          kind: 'config',
          title: 'Customer data isolation controls',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            "Configuration or code demonstrating enforced isolation of each customer's data. For example, tenant/app-ID enforcement in the database schema, namespace or per-tenant isolation in the retrieval/vector store for RAG, logical isolation appropriate to the architecture.",
        },
        {
          id: 'A005.3',
          kind: 'config',
          title: 'Privacy-enhancing controls',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            'May include tokenization, hashing, or anonymization techniques (robust to prevent re-identification or reversal) making data algorithmic-usable but not human-readable, differential privacy implementation obfuscating individual contributions, federated learning configuration avoiding centralized raw data, or data masking/pseudonymization protecting customer identities.',
        },
      ],
      crosswalks: {
        'nist-ai-rmf': ['MEASURE 2.10: Privacy risk assessment'],
        'owasp-top-10': [
          'LLM02:25 - Sensitive Information Disclosure',
          'LLM05:25 - Improper Output Handling',
          'LLM08:25 - Vector and Embedding Weaknesses',
        ],
        'csa-aicm': [
          'I\\&S-06: Segmentation and Segregation',
          'DSP-22: Privacy Enhancing Technologies',
          'UEM-08: Storage Encryption',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 30: Training Data - Personal information in data',
          'IBM 31: Training Data - Reidentification',
          'IBM 38: Training Data - Confidential information in data',
          'IBM 57: Inference - Membership inference attack',
          'IBM 72: Output - Exposing personal information',
          'IBM 74: Output - Revealing confidential information',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-8.2: Data Exfiltration / Exposure',
          'AITech-10.2: Model Inversion',
          'AITech-12.2: Insecure Output Handling',
        ],
        'owasp-agentic-top-10': ['ASI06 - Memory and Context Poisoning'],
      },
    },
    {
      id: 'A006',
      title: 'Prevent PII leakage',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/data-and-privacy/prevent-pii-leakage',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Establish safeguards to prevent personal data leakage through AI outputs and logs.',
      keywords: ['Personal Data Leakage'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Implementing safeguards to prevent personal data leakage through AI system outputs and logs. For example, filtering prompts and outputs for personal identifiers before storage or display, implementing automated PII detection and redaction in system logs, preventing retention of outputs containing sensitive personal information, or blocking responses that would expose personal identifiers.',
        },
        {
          required: 'supplemental',
          activity:
            'Integrating with existing data loss prevention (DLP) systems to monitor and block outputs containing personal data in violation of policy.',
        },
      ],
      evidence: [
        {
          id: 'A006.1',
          kind: 'config',
          title: 'PII detection and filtering',
          required: 'core',
          category: 'technical-implementation',
          locations: [
            'Eng: LLM output filtering logic',
            'Eng: User LLM input filtering logic',
            'Universal',
          ],
          description:
            'Configuration or code output demonstrating filtering of LLM inputs and/or outputs for personal identifiers - may include keyword checks or regex patterns detecting PII (e.g. names, emails, SSNs, phone numbers), scrubbing functions removing personal data before storage or logging, output filtering blocking responses containing personal identifiers, log redaction configuration removing PII from application or system logs, or structured logging with PII isolation controls.',
        },
        {
          id: 'A006.2',
          kind: 'config',
          title: 'DLP system integration',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            'Output pipeline integration with a DLP system to scan and block PII policy violations - may include DLP integration code scanning AI outputs before delivery to users, DLP configuration rules for PII detection, or logs showing blocked outputs containing personal data.',
        },
      ],
      crosswalks: {
        'mitre-atlas': ['AML-M0020: Generative AI Guardrails'],
        'eu-ai-act': [
          'Article 72: Post-Market Monitoring by Providers and Post-Market Monitoring Plan for High-Risk AI Systems',
        ],
        'nist-ai-rmf': ['MEASURE 2.10: Privacy risk assessment'],
        'owasp-top-10': [
          'LLM02:25 - Sensitive Information Disclosure',
          'LLM05:25 - Improper Output Handling',
          'LLM08:25 - Vector and Embedding Weaknesses',
        ],
        'csa-aicm': [
          'DSP-10: Sensitive Data Transfer',
          'DSP-17: Sensitive Data Protection',
          'HRS-12: Personal and Sensitive Data Awareness and Training',
          'DSP-13: Personal Data Sub-processing',
          'UEM-08: Storage Encryption',
          'DSP-12: Limitation of Purpose in Personal Data Processing',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 30: Training Data - Personal information in data',
          'IBM 45: Inference - Confidential data in prompt',
          'IBM 55: Inference - Personal information in prompt',
          'IBM 72: Output - Exposing personal information',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-8.1: Membership Inference',
          'AITech-8.2: Data Exfiltration / Exposure',
          'AITech-8.3: Information Disclosure',
          'AITech-12.2: Insecure Output Handling',
        ],
        'soc-2': [
          'C1.2: Dispose of confidential information',
          'P4.1: Limit use of personal information',
          'P4.3: Secure disposal of personal information',
          'PI1.5: Storage completeness and accuracy',
        ],
      },
    },
    {
      id: 'A007',
      title: 'Prevent IP violations',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/data-and-privacy/prevent-ip-violations',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement safeguards and technical controls to prevent AI outputs from violating copyrights, trademarks, or other third-party intellectual property rights.',
      keywords: ['Intellectual Property', 'Copyright Protection'],
      capabilities: ['External-facing'],
      activities: [
        {
          required: 'core',
          activity:
            'Documenting foundation model provider IP protections which may serve as primary infringement safeguards. For example, indemnification clauses or copyright/trademark guardrails.',
        },
        {
          required: 'supplemental',
          activity:
            'Establishing supplementary content filtering mechanisms where provider protections have gaps or limitations. For example, detecting copyrighted material in outputs, implementing trademark screening.',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing user guidance and guardrails to reduce IP risk. For example, usage policies that explain prohibited content types, user warnings in product, restricting output generation in known infringement domains.',
        },
        {
          required: 'supplemental',
          activity: 'Implementing restrictions in AI acceptable use policy.',
        },
      ],
      evidence: [
        {
          id: 'A007.1',
          kind: 'documentation',
          title: 'Model provider IP infringement protections',
          required: 'core',
          category: 'legal-policies',
          locations: ['Vendor Contracts', 'External-facing'],
          description:
            'Foundation model provider contract, terms of service, or data processing agreement showing IP protection commitments including copyright/trademark handling policies, indemnification clauses, liability coverage, and any documented limitations or exclusions. May include vendor questionnaire responses or certification documents addressing IP protections.',
        },
        {
          id: 'A007.2',
          kind: 'config',
          title: 'IP infringement filtering',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: [
            'Engineering Code',
            'Eng: LLM output filtering logic',
            'External-facing',
          ],
          description:
            'Code, API configuration, or filtering system showing detection of copyrighted material, trademark screening, or content validation checks applied to AI outputs - this could be pattern matching logic, third-party API integration (e.g. copyright detection services), or custom filtering rules.',
        },
        {
          id: 'A007.3',
          kind: 'logs',
          title: 'User-facing notices',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Product', 'Acceptable Use Policy', 'External-facing'],
          description:
            'User-facing IP risk guidance - may include warning messages when attempting high-risk operations, help center articles about IP infringement guidance, or UI elements explaining prohibited use cases.',
        },
      ],
      crosswalks: {
        'mitre-atlas': ['AML-M0020: Generative AI Guardrails'],
        'nist-ai-rmf': [
          'GOVERN 6.1: Third-party risk policies',
          'MAP 4.1: Legal risk mapping',
        ],
        'owasp-top-10': [
          'LLM03:25 - Supply Chain',
          'LLM05:25 - Improper Output Handling',
        ],
        'iso-42001': ['A.7.5: Data provenance'],
        'csa-aicm': ['AIS-09: Output Validation'],
        'ibm-ai-risk-atlas': [
          'IBM 39: Training Data - Data usage rights restrictions',
          'IBM 44: Inference - IP information in prompt',
          'IBM 73: Output - Copyright infringement',
          'IBM 88: Non-Technical - Model usage rights restrictions',
          'IBM 90: Non-Technical - Generated content ownership and IP',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-8.2: Data Exfiltration / Exposure',
          'AITech-8.4: Prompt/Meta Extraction',
          'AITech-15.1: Harmful Content',
        ],
        'soc-2': ['CC3.1: Clear objectives for risk assessment'],
      },
    },
    {
      id: 'A008',
      title: 'Prevent leakage of credentials and secrets',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/data-and-privacy/prevent-secrets-leakage',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement safeguards to detect and prevent leakage of secrets in AI system inputs, outputs, logs, and credential storage.',
      capabilities: ['Code-generation'],
      activities: [
        {
          required: 'core',
          activity:
            'Implementing safeguards to detect credentials in user inputs. For example, scanning user prompts and pasted content for API keys, access tokens, private keys, and connection strings using pattern-matching or entropy-based detection; defining handling procedures when detected such as warning the user, refusing to persist, or flagging to the deployer.',
        },
        {
          required: 'core',
          activity:
            'Implementing safeguards to keep secrets out of generated code artifacts. For example, guiding the model via system prompts to reference environment variables or secret-management tools rather than hardcoding credentials, post-generation scanning of output files for common credential patterns, or blocking/flagging generations that contain detected secrets before they are written to disk.',
        },
        {
          required: 'core',
          activity:
            "Implementing safeguards to securely store user-provided credentials to enable agent-connected services. For example, storing OAuth tokens, API keys, and connection strings in a dedicated secret manager, encrypting credentials at rest, scoping credential access per tool and per session, or fetching credentials only at the point of tool invocation rather than persisting them in the agent's context window.",
        },
        {
          required: 'supplemental',
          activity:
            'Implementing user-facing warnings when potential secrets are detected in user inputs. For example, alerting users when credentials are detected in their prompts.',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing safeguards to prevent secrets from being retained in platform logs, conversation history, and stored artifacts. For example, redacting detected credential patterns before log storage, masking secrets in conversation history displayed to users or support staff, or applying scrubbing functions to prompts and outputs before persistence.',
        },
      ],
      evidence: [
        {
          id: 'A008.1',
          kind: 'config',
          title: 'Secrets detection in user inputs',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Eng: User LLM input filtering logic', 'Code-generation'],
          description:
            'Code or configuration demonstrating input-side secrets detection. For example, regex patterns or detection libraries (e.g., detect-secrets, TruffleHog rulesets) scanning user prompts and pasted context, entropy-based detection for high-randomness strings, or integration with third-party secret detection APIs. Evidence should also show the defined handling response (e.g., user warning UI, rejection logic, or alert configuration).',
        },
        {
          id: 'A008.2',
          kind: 'config',
          title: 'Secrets handling in generated code',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Code-generation'],
          description:
            'Code, configuration, or system prompt excerpt demonstrating secrets hygiene - may include system prompt guidance directing the model toward envvar or secret-store patterns, scanning logic applied to generated files, sample generations on credential-requiring prompts showing envvar references rather than literals, or block/flag logic preventing persistence of outputs containing detected secrets.',
        },
        {
          id: 'A008.3',
          kind: 'config',
          title: 'Secure storage of user-provided credentials',
          required: 'core',
          category: 'technical-implementation',
          locations: [
            'Engineering Code',
            'Engineering Practice',
            'Code-generation',
          ],
          description:
            'Configuration showing secure handling of user-provided credentials — may include secret manager integration (e.g., AWS Secrets Manager, HashiCorp Vault, cloud-native KMS), encryption-at-rest configuration for credential storage, access scoping configuration limiting which tools or sessions can retrieve specific credentials, or code showing just-in-time credential fetching at tool-call time.',
        },
        {
          id: 'A008.4',
          kind: 'documentation',
          title: 'User-facing warnings for detected secrets',
          required: 'supplemental',
          category: 'operational-practices',
          locations: ['Product', 'Code-generation'],
          description:
            'Documentation of user-facing warnings when secrets are detected in inputs — may include user-facing documentation showing warning messages displayed when credentials are detected in user input before model inference.',
        },
        {
          id: 'A008.5',
          kind: 'config',
          title: 'Secrets redaction in logs and stored artifacts',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Logs', 'Code-generation'],
          description:
            'Code or configuration showing secrets redaction in stored data - may include log redaction rules alongside PII patterns (extending A006.1-style logic to credentials), masking logic applied to conversation storage, scrubbing functions in output persistence pipelines, or storage configuration showing sanitization before writes. Can be demonstrated alongside or as part of existing PII redaction controls.',
        },
      ],
      crosswalks: {},
    },
    {
      id: 'A009',
      title: 'Third-party testing for data & privacy risk',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/data-and-privacy/3rd-party-testing-for-data-and-privacy-risk',
      cadence_months: 3,
      summary:
        'Appoint expert third-parties to evaluate system robustness to data & privacy risk as defined in the AIUC-1 risk taxonomy at least every 3 months',
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Appointing qualified third-party assessors. Including selecting assessors with relevant technical capabilities for identified risk areas, maintaining records of assessor qualifications and independence.',
        },
        {
          required: 'core',
          activity:
            'Conducting regular testing. Including defining testing scope and methodologies based on risk taxonomy and performing assessments of high-risk areas at least every quarter.',
        },
        {
          required: 'core',
          activity:
            'Maintaining documentation. Including testing scope and results.',
        },
      ],
      evidence: [
        {
          id: 'A009.1',
          kind: 'evals',
          title: 'Third-party evaluation report assessing data & privacy risk',
          required: 'core',
          category: 'third-party-evals',
          locations: ['Third-party evaluation report', 'Universal'],
          description:
            'Third-party evaluation report showing testing for data & privacy risk - including risks tested (e.g., IP infringement, personal data leakage, business data leakage), testing methodology and findings',
        },
      ],
      crosswalks: {},
    },
    {
      id: 'B001',
      title: 'Third-party testing for security risk',
      domain: 'B',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/security/test-adversarial-robustness',
      cadence_months: 3,
      type: 'preventative',
      summary:
        'Appoint expert third-parties to evaluate system robustness to security risk as defined in the AIUC-1 risk taxonomy at least every 3 months',
      keywords: [
        'Adversarial Testing',
        'Red Teaming',
        'Prompt Injection',
        'Jailbreak',
      ],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Appointing qualified third-party assessors. Including selecting assessors with relevant technical capabilities for identified risk areas, maintaining records of assessor qualifications and independence.',
        },
        {
          required: 'core',
          activity:
            'Conducting regular testing. Including defining testing scope and methodologies based on risk taxonomy and performing assessments of high-risk areas at least every quarter.',
        },
        {
          required: 'core',
          activity:
            'Maintaining documentation. Including testing scope and results.',
        },
        {
          required: 'supplemental',
          activity:
            'Aligning adversarial testing with broader security testing programs. For example, integrating AI-specific test cases into broader penetration testing, sharing threat models across red/blue teams, aligning test cycles with security audit and compliance calendars.',
        },
      ],
      evidence: [
        {
          id: 'B001.1',
          kind: 'evals',
          title: 'Third-party evaluation report assessing security risk',
          required: 'core',
          category: 'third-party-evals',
          locations: ['Third-party evaluation report', 'Universal'],
          description:
            'Third-party evaluation report showing testing for security risk - including risks tested (e.g., insecure outputs, prompt injection), testing methodology and findings',
        },
        {
          id: 'B001.2',
          kind: 'documentation',
          title: 'Security program integration',
          required: 'supplemental',
          category: 'operational-practices',
          locations: [
            'Engineering Practice',
            'Internal processes',
            'Universal',
          ],
          description:
            'Penetration test reports with AI-specific test cases, shared threat models, and testing calendars, or documentation of broader security program incorporating AI adversarial testing requirements.',
        },
      ],
      crosswalks: {
        'mitre-atlas': [
          'AML-M0003: Model Hardening',
          'AML-M0004: Restrict Number of AI Model Queries',
        ],
        'nist-ai-rmf': [
          'GOVERN 4.3: Testing and incident sharing',
          'MEASURE 2.1: TEVV documentation',
          'MEASURE 2.6: Safety evaluation',
          'MEASURE 2.7: Security and resilience',
        ],
        'owasp-top-10': [
          'LLM01:25 - Prompt Injection',
          'LLM04:25 - Data and Model Poisoning',
          'LLM05:25 - Improper Output Handling',
          'LLM08:25 - Vector and Embedding Weaknesses',
        ],
        'csa-aicm': [
          'AIS-07: Application Vulnerability Remediation',
          'MDS-06: Adversarial Attack Analysis',
          'MDS-07: Robustness against Adversarial Attack / Model Hardening',
          'TVM-01: Threat and Vulnerability Management Policy and Procedures',
          'TVM-03: Vulnerability Remediation Schedule',
          'TVM-05: External Library Vulnerabilities',
          'TVM-06: Penetration Testing',
          'TVM-07: Vulnerability Remediation Schedule',
          'TVM-08: Vulnerability Prioritization',
          'TVM-12: Threat Analysis and Modeling',
          'TVM-13: Threat Response',
          'AIS-08: Input Validation',
        ],
        'owasp-aivss': [
          'Agent Cascading Failures',
          'Agent Goal and Instruction Manipulation',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 41: Inference - Evasion attack',
          'IBM 43: Inference - Jailbreaking',
          'IBM 46: Inference - Prompt injection attack',
          'IBM 50: Inference - Direct instructions attack',
          'IBM 52: Inference - Indirect instructions attack',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-1.1: Direct Prompt Injection',
          'AITech-1.2: Indirect Prompt Injection',
          'AITech-1.3: Goal Manipulation',
          'AITech-1.4: Multi-Modal Injection and Manipulation',
          'AITech-2.1: Jailbreak',
          'AITech-3.1: Masquerading / Obfuscation / Impersonation',
          'AITech-4.1: Agent Injection',
          'AITech-4.2: Context Boundary Attacks',
          'AITech-4.3: Protocol Manipulation',
          'AITech-5.1: Memory System Persistence',
          'AITech-5.2: Configuration Persistence',
          'AITech-7.2: Memory System Corruption',
          'AITech-7.4: Token Manipulation',
          'AITech-9.1: Model or Agentic System Manipulation',
          'AITech-9.2: Detection Evasion',
          'AITech-11.2: Model-Selective Evasion',
          'AITech-12.2: Insecure Output Handling',
          'AITech-17.1: Sensor Spoofing',
          'AITech-19.1: Cross-Modal Inconsistency Exploits',
          'AITech-19.2: Fusion Payload Split',
        ],
        'owasp-agentic-top-10': [
          'ASI01 - Agent Goal Hijack',
          'ASI06 - Memory and Context Poisoning',
        ],
        'soc-2': [
          'CC2.3: External communication of controls',
          'CC4.1: Ongoing and separate evaluations',
          'CC4.2: Evaluate and communicate deficiencies',
          'CC7.2: Anomaly monitoring',
        ],
      },
    },
    {
      id: 'B002',
      title: 'Detect adversarial input',
      domain: 'B',
      application: 'optional',
      retired: false,
      url: 'https://standard.aiuc-1.com/security/detect-adversarial-input',
      cadence_months: 3,
      type: 'detective',
      summary:
        'Implement monitoring capabilities to detect and enable responding to adversarial inputs and prompt injection attempts.',
      keywords: ['Monitor', 'Adversarial', 'Jailbreak', 'Prompt Injection'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Establishing detection and alerting. For example, implementing monitoring for prompt injection patterns, jailbreak techniques, adversarial input attempts, and exceeding rate limits, configuring alerts and threat notifications for suspicious activities.',
        },
        {
          required: 'core',
          activity:
            'Implementing incident logging and response procedures. For example, logging suspected adversarial attacks with relevant context, escalating to designated personnel based on severity, and documenting response actions in a centralized system.',
        },
        {
          required: 'core',
          activity:
            'Maintaining detection effectiveness through quarterly reviews. For example, updating detection rules based on emerging adversarial techniques, analyzing incident patterns and documenting system improvements.',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing adversarial input detection prior to AI model processing where feasible. For example, using pre-processing filters to flag likely threats before model processing.',
        },
        {
          required: 'supplemental',
          activity:
            'Integrating adversarial input detection into existing security operations tooling. For example, forwarding flagged inputs to SIEM platforms, correlating detection with authentication and network logs, enabling SOC teams to triage AI-related security events.',
        },
      ],
      evidence: [
        {
          id: 'B002.1',
          kind: 'config',
          title: 'Adversarial input detection and alerting',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            'Monitoring system, SIEM, or detection code showing rules and alerts for adversarial inputs - may include prompt injection detection patterns, jailbreak technique signatures, rate limit monitoring with threshold alerts, or notification configurations (Slack, PagerDuty, email)',
        },
        {
          id: 'B002.2',
          kind: 'logs',
          title: 'Adversarial incident and response',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Logs', 'Engineering Tooling', 'Universal'],
          description:
            'Incident management system or logs showing adversarial attack handling - may include log entries with timestamps and user/session context, escalation runbooks defining severity thresholds, or incident tickets in Jira/PagerDuty/ServiceNow documenting response actions and workflows.',
        },
        {
          id: 'B002.3',
          kind: 'documentation',
          title: 'Updates to detection config',
          required: 'core',
          category: 'technical-implementation',
          locations: [
            'Engineering Practice',
            'Internal processes',
            'Universal',
          ],
          description:
            'Quarterly review documentation showing detection updates - for example, review meeting notes with incident pattern analysis, updated detection rules with version history, or tracking records showing rule improvements (e.g. GitHub/Jira tickets).',
        },
        {
          id: 'B002.4',
          kind: 'config',
          title: 'Pre-processing adversarial detection',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            'Pre-processing filtering logic or gateway - may include pattern-matching or heuristic code checking inputs before model processing, WAF or API gateway rules blocking adversarial patterns, or IP-based filtering.',
        },
        {
          id: 'B002.5',
          kind: 'config',
          title: 'AI security alerts',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Tooling', 'Universal'],
          description:
            'SIEM platform, SOC tooling, or log forwarding configuration showing adversarial detection integration - may include Splunk/Datadog/Elastic SIEM ingesting AI adversarial alerts, correlation rules linking AI events with authentication or network logs, SOC dashboard displaying AI security event triage, or code forwarding flagged inputs to security platforms.',
        },
      ],
      crosswalks: {
        'mitre-atlas': [
          'AML-M0003: Model Hardening',
          'AML-M0015: Adversarial Input Detection',
          'AML-M0024: AI Telemetry Logging',
          'AML-M0021: Generative AI Guidelines',
        ],
        'eu-ai-act': [
          'Article 15: Accuracy Robustness and Cybersecurity',
          'Article 72: Post-Market Monitoring by Providers and Post-Market Monitoring Plan for High-Risk AI Systems',
        ],
        'nist-ai-rmf': [
          'GOVERN 1.5: Risk monitoring and review',
          'MEASURE 2.4: Production monitoring',
          'MEASURE 2.7: Security and resilience',
          'MEASURE 3.1: Emergent risk tracking',
        ],
        'owasp-top-10': [
          'LLM01:25 - Prompt Injection',
          'LLM08:25 - Vector and Embedding Weaknesses',
          'LLM10:25 - Unbounded Consumption',
        ],
        'csa-aicm': [
          'AIS-08: Input Validation',
          'MDS-07: Robustness against Adversarial Attack / Model Hardening',
          'TVM-01: Threat and Vulnerability Management Policy and Procedures',
          'TVM-04: Detection Updates',
          'UEM-09: Anti-Malware Detection and Prevention',
          'TVM-02: Malware and Malicious Instructions Protection Policy and Procedure',
          'AIS-10: API Security',
          'LOG-14: Input Monitoring',
        ],
        'owasp-aivss': ['Agent Goal and Instruction Manipulation'],
        'ibm-ai-risk-atlas': [
          'IBM 41: Inference - Evasion attack',
          'IBM 43: Inference - Jailbreaking',
          'IBM 46: Inference - Prompt injection attack',
          'IBM 49: Inference - Context overload attack',
          'IBM 52: Inference - Indirect instructions attack',
          'IBM 53: Inference - Social hacking attack',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-1.1: Direct Prompt Injection',
          'AITech-1.2: Indirect Prompt Injection',
          'AITech-1.4: Multi-Modal Injection and Manipulation',
          'AITech-2.1: Jailbreak',
          'AITech-3.1: Masquerading / Obfuscation / Impersonation',
          'AITech-4.3: Protocol Manipulation',
          'AITech-5.1: Memory System Persistence',
          'AITech-5.2: Configuration Persistence',
          'AITech-7.2: Memory System Corruption',
          'AITech-7.4: Token Manipulation',
          'AITech-9.1: Model or Agentic System Manipulation',
          'AITech-9.2: Detection Evasion',
          'AITech-11.2: Model-Selective Evasion',
          'AITech-17.1: Sensor Spoofing',
        ],
        'owasp-agentic-top-10': [
          'ASI01 - Agent Goal Hijack',
          'ASI06 - Memory and Context Poisoning',
        ],
        'soc-2': [
          'CC6.6: Protection against external threats',
          'CC6.8: Malicious software prevention',
          'CC7.2: Anomaly monitoring',
        ],
      },
    },
    {
      id: 'B003',
      title: 'Manage public release of technical details',
      domain: 'B',
      application: 'optional',
      retired: false,
      url: 'https://standard.aiuc-1.com/security/limit-technical-over-disclosure',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement controls to prevent over-disclosure of technical information about AI systems and organizational details that could enable adversarial targeting.',
      keywords: ['Public Disclosure', 'Open-Source', 'External Threats'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Documenting limitations on technical information release. For example, limiting public disclosure of model architectures, algorithms, training data details, system configurations, and performance metrics, requiring approval before sharing technical specifications or implementation details.',
        },
        {
          required: 'core',
          activity:
            'Controlling organizational information to balance transparency with security. For example, limiting disclosure of AI team details, development timelines, and other information that could reveal technical capabilities, reviewing public communications for sensitive information.',
        },
        {
          required: 'supplemental',
          activity:
            'Establishing approval processes. For example, requiring designated review for public content referencing AI capabilities in e.g. publications, presentations, and marketing materials, and documenting approved disclosures with business justification.',
        },
      ],
      evidence: [
        {
          id: 'B003.1',
          kind: 'documentation',
          title: 'Technical information disclosure guidelines',
          required: 'core',
          category: 'operational-practices',
          locations: ['Internal policies', 'Universal'],
          description:
            'Policy document, SOP, or handbook section defining limitations and approval requirements for publicly sharing AI system technical details - may include communication policy limiting disclosure of model architectures or configurations, engineering handbook with approval workflows for technical specifications, or internal procedures controlling release of organizational AI information.',
        },
        {
          id: 'B003.2',
          kind: 'documentation',
          title: 'Public disclosure approval records',
          required: 'supplemental',
          category: 'operational-practices',
          locations: ['Internal processes', 'Universal'],
          description:
            'Approval email, ticket, or review documentation for public AI communications - may include approval requests in email or Jira/Slack for blog posts or press releases, marketing review records for AI capability disclosures, or periodic security review logs for public-facing AI content.',
        },
      ],
      crosswalks: {
        'mitre-atlas': [
          'AML-M0000: Limit Public Release of Information',
          'AML-M0001: Limit Model Artifact Release',
        ],
        'owasp-top-10': [
          'LLM02:25 - Sensitive Information Disclosure',
          'LLM07:25 - System Prompt Leakage',
        ],
        'csa-aicm': [
          'AIS-09: Output Validation',
          'AIS-15: Prompt Differentiation',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 42: Inference - Extraction attack',
          'IBM 47: Inference - Prompt leaking',
        ],
        'cisco-ai-security-safety-framework': ['AITech-10.2: Model Inversion'],
        'soc-2': [
          'CC2.3: External communication of controls',
          'CC6.6: Protection against external threats',
        ],
      },
    },
    {
      id: 'B004',
      title: 'Prevent AI endpoint scraping',
      domain: 'B',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/security/prevent-ai-endpoint-scraping',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement safeguards to prevent probing or scraping of external AI endpoints.',
      keywords: [
        'Scraping',
        'Probing',
        'Rate Limiting',
        'Query Quotas',
        'Zero Trust',
      ],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Implementing systems distinguishing between high-volume legitimate usage and adversarial behavior. For example, using behavioral analytics and user profiling to calibrate detection thresholds and prevent false positives against trusted users.',
        },
        {
          required: 'core',
          activity:
            'Implementing rate limiting and query restrictions. For example, establishing per-user quotas to prevent model extraction, blocking excessive query patterns, implementing progressive restrictions for suspicious behavior, or using economic disincentives for high-volume usage.',
        },
        {
          required: 'core',
          activity:
            'Conducting simulated external attack testing of AI endpoints. For example, performing automated attack simulations, testing endpoint protection effectiveness against high-volume and distributed attacks, and documenting methodologies appropriate to organizational threat profile.',
        },
        {
          required: 'core',
          activity:
            'Maintaining endpoint security through remediation. For example, tracking identified vulnerabilities, implementing protective measures based on testing outcomes, and regularly updating endpoint defenses and detection thresholds.',
        },
      ],
      evidence: [
        {
          id: 'B004.1',
          kind: 'config',
          title: 'Anomalous usage detection',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Tooling', 'Engineering Code', 'Universal'],
          description:
            'Anomaly detection system or configuration file - may include behavioral analytics dashboard (Datadog, Elastic, Splunk) with user scoring rules, rate limiting configuration with tier-based thresholds (config.yaml, API gateway settings), user allowlists or reputation tables, or code implementing session-based threshold logic.',
        },
        {
          id: 'B004.2',
          kind: 'config',
          title: 'Rate limits',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Tooling', 'Universal'],
          description:
            'Rate limiting configuration for API endpoints - may include per-user quota settings, query throttling rules, progressive restriction policies, WAF configuration (Cloudflare, AWS WAF, Azure Application Gateway) with blocking rules for excessive patterns, or pricing tier settings implementing usage-based cost increases.',
        },
        {
          id: 'B004.3',
          kind: 'report',
          title: 'External pentest of AI endpoints',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Practice', 'Universal'],
          description:
            'Third-party penetration test report for AI endpoints including attack simulations tested (e.g. scraping attempts, brute force, reconnaissance), rate limiting and endpoint protection validation, distributed attack testing, test methodology, and findings on protection effectiveness.',
        },
        {
          id: 'B004.4',
          kind: 'documentation',
          title: 'Vulnerability remediation',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Practice', 'Universal'],
          description:
            'Issue tracking system (GitHub, Jira, Linear) showing endpoint vulnerability lifecycle - must include vulnerability identification, remediation proposal, implementation, and production deployment with timestamps and approval records.',
        },
      ],
      crosswalks: {
        'mitre-atlas': [
          'AML-M0003: Model Hardening',
          'AML-M0004: Restrict Number of AI Model Queries',
        ],
        'eu-ai-act': ['Article 15: Accuracy Robustness and Cybersecurity'],
        'nist-ai-rmf': ['MEASURE 2.7: Security and resilience'],
        'owasp-top-10': [
          'LLM02:25 - Sensitive Information Disclosure',
          'LLM05:25 - Improper Output Handling',
          'LLM08:25 - Vector and Embedding Weaknesses',
          'LLM10:25 - Unbounded Consumption',
        ],
        'csa-aicm': [
          'AIS-10: API Security',
          'UEM-01: Endpoint Devices Policy and Procedures',
          'UEM-05: Endpoint Management',
          'UEM-09: Anti-Malware Detection and Prevention',
          'UEM-10: Software Firewall',
          'UEM-11: Data Loss Prevention',
          'UEM-14: Third-Party Endpoint Security Posture',
          'TVM-06: Penetration Testing',
        ],
        'owasp-aivss': ['Agentic AI Tool Misuse'],
        'ibm-ai-risk-atlas': [
          'IBM 42: Inference - Extraction attack',
          'IBM 47: Inference - Prompt leaking',
          'IBM 56: Inference - Attribute inference attack',
          'IBM 57: Inference - Membership inference attack',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-1.4: Multi-Modal Injection and Manipulation',
          'AITech-8.2: Data Exfiltration / Exposure',
          'AITech-10.1: Model Extraction',
          'AITech-10.2: Model Inversion',
          'AITech-12.2: Insecure Output Handling',
          'AITech-13.1: Disruption of Availability',
          'AITech-13.2: Cost Harvesting / Repurposing',
        ],
        'soc-2': ['CC6.6: Protection against external threats'],
      },
    },
    {
      id: 'B005',
      title: 'Implement real-time input filtering',
      domain: 'B',
      application: 'optional',
      retired: false,
      url: 'https://standard.aiuc-1.com/security/implement-real-time-input-filtering',
      cadence_months: 12,
      type: 'detective',
      summary:
        'Implement real-time input filtering using automated moderation tools.',
      keywords: [
        'Prompt Injection',
        'Jailbreak',
        'Adversarial Input Protection',
      ],
      capabilities: ['Text-generation', 'Voice-generation', 'Image-generation'],
      activities: [
        {
          required: 'core',
          activity:
            'Integrating automated moderation tools to filter inputs before they reach the foundation model. For example, integrating third-party moderation APIs, implementing custom filtering rules, configuring blocking or warning actions for flagged content, and establishing confidence thresholds based on risk category and severity',
        },
        {
          required: 'supplemental',
          activity:
            'Documenting the moderation logic and rationale. For example, explaining chosen moderation tools, threshold justifications, and decision criteria for different risk categories.',
        },
        {
          required: 'supplemental',
          activity: 'Providing feedback to users when inputs are blocked.',
        },
        {
          required: 'supplemental',
          activity:
            'Logging flagged prompts for analysis and refinement of filters, while ensuring compliance with privacy obligations.',
        },
        {
          required: 'supplemental',
          activity:
            'Periodically evaluating filter performance and adjusting thresholds accordingly. For example, accuracy, latency, false positives/negatives.',
        },
      ],
      evidence: [
        {
          id: 'B005.1',
          kind: 'config',
          title: 'Input filtering',
          required: 'core',
          category: 'technical-implementation',
          locations: [
            'Eng: User LLM input filtering logic',
            'Engineering Tooling',
            'Text-generation',
            'Voice-generation',
            'Image-generation',
          ],
          description:
            'Moderation tool integration showing API configuration, filtering rules, action settings (block/warn/modify), and confidence thresholds for different violation categories - this could be screenshots of configuration files, admin dashboard settings, or API integration code. Example moderation tools: OpenAI Moderation API, Claude content filtering, VirtueAI/Hive/Spectrum Labs',
        },
        {
          id: 'B005.2',
          kind: 'documentation',
          title: 'Input moderation approach',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: [
            'Internal processes',
            'Engineering Practice',
            'Text-generation',
            'Voice-generation',
            'Image-generation',
          ],
          description:
            'Document explaining moderation approach including tool selection rationale, threshold settings with justifications, action logic for different violation types, and examples of how different input categories are handled.',
        },
        {
          id: 'B005.3',
          kind: 'demonstration',
          title: 'Warning for blocked inputs',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: [
            'Product',
            'Text-generation',
            'Voice-generation',
            'Image-generation',
          ],
          description:
            'User-facing messages or UI flows showing how blocked inputs are communicated to users - this could be error messages, warning dialogs, or alternative suggestions provided when content is filtered.',
        },
        {
          id: 'B005.4',
          kind: 'logs',
          title: 'Input filtering',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: [
            'Logs',
            'Text-generation',
            'Voice-generation',
            'Image-generation',
          ],
          description:
            'Logging system showing how flagged inputs are captured, what metadata is included/excluded for privacy, retention policies, and audit trail - may include privacy documentation explaining logging disclosures to users.',
        },
        {
          id: 'B005.5',
          kind: 'documentation',
          title: 'Input filter performance',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: [
            'Engineering Practice',
            'Text-generation',
            'Voice-generation',
            'Image-generation',
          ],
          description:
            'Report or dashboard showing analysis of filter performance metrics (false positives, false negatives, accuracy, latency) and documented threshold adjustments made based on performance data - should include timestamps and rationale for changes.',
        },
      ],
      crosswalks: {
        'owasp-top-10': [
          'LLM01:25 - Prompt Injection',
          'LLM04:25 - Data and Model Poisoning',
          'LLM10:25 - Unbounded Consumption',
        ],
        'mitre-atlas': [
          'AML-M0015: Adversarial Input Detection',
          'AML-M0021: Generative AI Guidelines',
        ],
        'nist-ai-rmf': ['MEASURE 2.7: Security and resilience'],
        'csa-aicm': [
          'LOG-14: Input Monitoring',
          'AIS-08: Input Validation',
          'AIS-15: Prompt Differentiation',
        ],
        'owasp-aivss': ['Agent Goal and Instruction Manipulation'],
        'ibm-ai-risk-atlas': [
          'IBM 50: Inference - Direct instructions attack',
          'IBM 53: Inference - Social hacking attack',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-1.2: Indirect Prompt Injection',
          'AITech-7.4: Token Manipulation',
          'AITech-11.2: Model-Selective Evasion',
        ],
        'owasp-agentic-top-10': [
          'ASI01 - Agent Goal Hijack',
          'ASI06 - Memory and Context Poisoning',
        ],
        'soc-2': [
          'CC8.1: Change management',
          'PI1.2: Input completeness and accuracy',
        ],
      },
    },
    {
      id: 'B006',
      title: 'Prevent unauthorized AI agent actions',
      domain: 'B',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/security/enforce-contextual-access-controls',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement safeguards to prevent AI agents from performing actions beyond intended scope and authorized privileges.',
      keywords: ['Access Permissions', 'Agent Permissions'],
      capabilities: ['Automation'],
      activities: [
        {
          required: 'core',
          activity:
            'Implementing technical restrictions that limit agent capabilities to authorized scope. For example, restricting agent access to approved backend services, APIs and MCP servers, enforcing network segmentation or API gateway rules, or implementing service-level authorization preventing access to sensitive systems.',
        },
        {
          required: 'core',
          activity:
            'Deploying monitoring and alerting for agent actions that exceed security boundaries. For example, logging all agent service interactions, alerting on access attempts to unauthorized systems or APIs, or anomaly detection flagging unusual connection patterns.',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing additional safeguards to contain runtime risk. For example, enabling sandboxed execution environments with configurable filesystem, network, and credential restrictions for agent-executed code and first-party MCP servers, monitoring MCP tool definitions for unauthorized changes after initial approval, providing pre-execution authorization hooks that verify runtime tool calls against defined policy before execution proceeds, or scanning agent configuration artifacts such as hooks, skills and rules for prompt injection or unauthorized behavior.',
        },
      ],
      evidence: [
        {
          id: 'B006.1',
          kind: 'config',
          title: 'Agent service access restrictions',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Automation'],
          description:
            'Configuration showing technical limitations on agent backend access - may include API gateway rules restricting accessible services, network policies defining allowed endpoints, MCP server allowlist or registration configuration restricting which MCP servers and tools the agent may connect to, service-level authorization configuration, or architecture diagram showing agent isolation boundaries including MCP server placement and network segmentation.',
        },
        {
          id: 'B006.2',
          kind: 'config',
          title: 'Agent security monitoring and alerting',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Logs', 'Automation'],
          description:
            'Implementation of monitoring configuration tracking agent security-relevant actions - may include logging setup capturing agent service calls and authentication attempts, alert rules for unauthorized system access, security monitoring dashboard showing agent infrastructure interactions, or example logs demonstrating boundary violations are detected.',
        },
        {
          id: 'B006.3',
          kind: 'config',
          title: 'Execution-level safeguards',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Automation'],
          description:
            'Configuration or code demonstrating runtime containment controls — may include sandbox or container configuration showing configurable filesystem, network, and credential restrictions for agent code execution environments and first-party MCP servers, tool definition integrity controls showing how unauthorized post-approval changes are detected, pre-execution hook or policy engine configuration showing tool calls are verified at runtime, or scanning of agent configuration artifacts for prompt injection or malicious patterns.',
        },
      ],
      crosswalks: {
        'nist-ai-rmf': ['MAP 2.1: Task definition'],
        'owasp-top-10': [
          'LLM08:25 - Vector and Embedding Weaknesses',
          'LLM10:25 - Unbounded Consumption',
        ],
        'csa-aicm': [
          'AIS-11: Agents Security Boundaries',
          'IAM-19: Agent Access Restriction',
          'DSP-07: Data Protection by Design and Default',
        ],
        'owasp-aivss': [
          'Agent Access Control Violation',
          'Agent Orchestration and Multi-Agent Exploitation',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 5: Agentic AI - Misaligned actions',
          'IBM 7: Agentic AI - Unauthorized use',
          'IBM 8: Agentic AI - Exploit trust mismatch',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-1.3: Goal Manipulation',
          'AITech-3.1: Masquerading / Obfuscation / Impersonation',
          'AITech-4.1: Agent Injection',
          'AITech-4.2: Context Boundary Attacks',
          'AITech-5.2: Configuration Persistence',
          'AITech-7.2: Memory System Corruption',
          'AITech-14.2: Abuse of Delegated Authority',
        ],
        'owasp-agentic-top-10': [
          'ASI01 - Agent Goal Hijack',
          'ASI02 - Tool Misuse and Exploitation',
          'ASI03 - Identity and Privilege Abuse',
          'ASI05 - Unexpected Code Execution',
          'ASI07 - Insecure Inter-Agent Communication',
          'ASI10 - Rogue Agents',
        ],
        'soc-2': [
          'CC5.1: Select and develop control activities',
          'CC6.3: Role-based access management',
        ],
      },
    },
    {
      id: 'B007',
      title: 'Enforce user access privileges to AI systems',
      domain: 'B',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/security/enforce-ai-access-privileges',
      cadence_months: 3,
      type: 'preventative',
      summary:
        'Establish and maintain user access controls and admin privileges for AI systems in line with policy.',
      keywords: ['Access Controls', 'Organizational Policy'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Implementing system-level access controls tailored to AI systems. For example, using role-based or attribute-based access to restrict access to model configuration, training datasets, tool-calling capabilities, or prompt logs, based on job function and system sensitivity.',
        },
        {
          required: 'core',
          activity:
            'Restricting administrative and configuration privileges to authorized personnel. For example, limiting ability to alter system behavior, tools, or models.',
        },
        {
          required: 'core',
          activity:
            'Conducting access reviews and updates at least quarterly. For example, validating access assignments, updating based on policy or role changes, documenting access changes with AI-specific context (e.g. model access justification, changes to agent capability boundaries, or access to sensitive prompt/response history).',
        },
      ],
      evidence: [
        {
          id: 'B007.1',
          kind: 'config',
          title: 'User access controls',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Tooling', 'Universal'],
          description:
            'IAM platform, permission files, or admin panel showing role-based or attribute-based access restrictions for AI system resources (model configurations, training datasets, tool-calling capabilities, prompt logs) - may include IAM role assignments, permission policies, or authorization code validating user permissions before accessing sensitive AI components.',
        },
        {
          id: 'B007.2',
          kind: 'documentation',
          title: 'Access reviews',
          required: 'core',
          category: 'operational-practices',
          locations: ['Internal processes', 'Universal'],
          description:
            'Quarterly access review documentation - may include access review meeting notes, tracking records of access changes with justifications, or reports documenting role changes and access modifications based on policy updates.',
        },
      ],
      crosswalks: {
        'mitre-atlas': [
          'AML-M0005: Control Access to AI Models and Data at Rest',
          'AML-M0019: Control Access to AI Models and Data in Production',
        ],
        'owasp-top-10': [
          'LLM02:25 - Sensitive Information Disclosure',
          'LLM06:25 - Excessive Agency',
          'LLM10:25 - Unbounded Consumption',
        ],
        'csa-aicm': [
          'DSP-07: Data Protection by Design and Default',
          'DSP-08: Data Privacy by Design and Default',
          'IAM-01: Identity and Access Management Policy and Procedures',
          'IAM-02: Strong Password Policy and Procedures',
          'IAM-03: Identity Inventory',
          'IAM-04: Separation of Duties',
          'IAM-05: Least Privilege',
          'IAM-06: User Access Provisioning',
          'IAM-07: User Access Changes and Revocation',
          'IAM-08: User Access Review',
          'IAM-09: Segregation of Privileged Access Roles',
          'IAM-10: Management of Privileged Access Roles',
          'IAM-13: Uniquely Identifiable Users',
          'IAM-14: Strong Authentication',
          'IAM-15: Passwords and Secrets Management',
          'IAM-16: Authorization Mechanisms',
          'IAM-17: Knowledge Access Control - Need to Know',
          'IAM-18: Output Modification and Special Authorization',
          'LOG-04: Audit Logs Access and Accountability',
          'LOG-09: Log Protection',
          'LOG-12: Access Control Logs',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 7: Agentic AI - Unauthorized use',
          'IBM 8: Agentic AI - Exploit trust mismatch',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-14.1: Unauthorized Access',
        ],
        'owasp-agentic-top-10': [
          'ASI02 - Tool Misuse and Exploitation',
          'ASI03 - Identity and Privilege Abuse',
        ],
        'soc-2': [
          'CC5.2: General controls over technology',
          'CC6.1: Logical access security',
          'CC6.2: User registration and deprovisioning',
          'CC6.3: Role-based access management',
        ],
      },
    },
    {
      id: 'B008',
      title: 'Protect AI system deployment environment',
      domain: 'B',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/security/protect-model-deployment-environment',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement security measures for AI system deployment environments including encryption, access controls and authorization.',
      keywords: ['Model Environment', 'Encryption', 'Access Controls'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Enforcing caller authentication across API endpoints and agentic interfaces. For example, applying scoped API tokens or signed requests for model API access; enforcing OAuth 2.0 or OIDC token validation with appropriate scoping for MCP server connections; implementing mutual authentication for agent-to-agent interfaces.',
        },
        {
          required: 'core',
          activity:
            'Securing data in transit across model API endpoints and agentic interfaces. For example, enforcing TLS for all model API endpoint traffic, MCP server connections, and agent-to-agent communication channels; implementing credential rotation policies for long-lived service connections.',
        },
        {
          required: 'supplemental',
          activity:
            'Verifying model integrity before and during deployment. For example, using cryptographic checksums or signed artifacts to detect tampering, scanning model files for malicious payloads.',
        },
        {
          required: 'supplemental',
          activity:
            'Enforcing data integrity across agentic interfaces. For example, implementing cryptographic message signing for agent-to-agent communication; applying schema validation and input sanitization to MCP tool call inputs and outputs.',
        },
        {
          required: 'supplemental',
          activity:
            'Securing model hosting environments. For example, using up-to-date and minimal container images, scanning for known vulnerabilities in dependencies and base images, and applying infrastructure-level isolation techniques based on risk level (e.g. container namespaces, VM separation, or dedicated GPU access).',
        },
      ],
      evidence: [
        {
          id: 'B008.1',
          kind: 'config',
          title: 'API and agentic interface authentication',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            'Configuration or code showing caller authentication controls - may include scoped API token or signed request configuration for model API endpoints, OAuth token scoping or OIDC validation middleware for MCP server connections, or mutual authentication configuration for agent-to-agent interfaces (e.g. A2A protocol authentication config).',
        },
        {
          id: 'B008.2',
          kind: 'config',
          title: 'API and agentic interface transport security',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            'Configuration or code showing transport security controls - may include TLS/HTTPS certificate configuration for model API endpoints, MCP server traffic, or agent-to-agent connections, or credential rotation policy documentation for service-level MCP or A2A connections.',
        },
        {
          id: 'B008.5',
          kind: 'config',
          title: 'Model integrity verification',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            "Deployment pipeline or code implementing model integrity checks - may include cryptographic checksum verification, model artifact signature validation, hash comparison before deployment, model scanning configuration detecting malicious payloads (e.g. Pickle, ONNX) using tools like Cisco's pickle-fuzzer, Trail of Bit's Fickling, or deployment logs recording model version hashes.",
        },
        {
          id: 'B008.3',
          kind: 'config',
          title: 'Agentic interface data integrity',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            'Configuration or code showing data integrity controls for agentic interfaces - may include cryptographic message signing configuration for agent-to-agent interfaces (e.g. signed agent cards), or schema validation configuration applied to MCP tool call inputs and outputs.',
        },
        {
          id: 'B008.4',
          kind: 'config',
          title: 'Model hosting security',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            'Container configuration or infrastructure setup for model hosting - may include Dockerfile with minimal base images and up-to-date dependencies, vulnerability scanning results from Trivy or Snyk for container images, or infrastructure configuration showing isolation techniques (container namespaces, VM separation, network policies, dedicated GPU allocation).',
        },
      ],
      crosswalks: {
        'mitre-atlas': [
          'AML-M0005: Control Access to AI Models and Data at Rest',
          'AML-M0012: Encrypt Sensitive Information',
          'AML-M0019: Control Access to AI Models and Data in Production',
        ],
        'eu-ai-act': ['Article 15: Accuracy Robustness and Cybersecurity'],
        'owasp-top-10': ['LLM07:25 - System Prompt Leakage'],
        'csa-aicm': [
          'AIS-06: Secure Application Deployment',
          'AIS-14: AI Cache Protection',
          'CEK-01: Encryption and Key Management Policy and Procedures',
          'CEK-03: Data Encryption',
          'CEK-04: Encryption Algorithm',
          'CEK-19: Key Compromise',
          'CEK-10: Key Generation',
          'CEK-11: Key Purpose',
          'CEK-12: Key Rotation',
          'CEK-13: Key Revocation',
          'CEK-14: Key Destruction',
          'CEK-15: Key Activation',
          'CEK-16: Key Suspension',
          'CEK-17: Key Deactivation',
          'CEK-18: Key Archival',
          'CEK-20: Key Recovery',
          'CEK-21: Key Inventory Management',
          'IAM-04: Separation of Duties',
          'IAM-14: Strong Authentication',
          'MDS-01: Training Pipeline Security',
          'MDS-02: Model Artifact Scanning',
          'MDS-08: Model Integrity Checks',
          'UEM-08: Storage Encryption',
          'AIS-02: Application Security Baseline Requirements',
          'DSP-07: Data Protection by Design and Default',
          'MDS-09: Model Signing/Ownership Verification',
        ],
        'owasp-aivss': ['Agent Memory and Context Manipulation'],
        'ibm-ai-risk-atlas': [
          'IBM 7: Agentic AI - Unauthorized use',
          'IBM 29: Training Data - Data poisoning',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-1.3: Goal Manipulation',
          'AITech-6.1: Training Data Poisoning',
          'AITech-7.1: Reasoning Corruption',
          'AITech-10.1: Model Extraction',
          'AITech-11.1: Environment-Aware Evasion',
          'AITech-14.1: Unauthorized Access',
          'AITech-16.1: Eavesdropping',
        ],
        'owasp-agentic-top-10': [
          'ASI03 - Identity and Privilege Abuse',
          'ASI04 - Agentic Supply Chain Vulnerabilities',
          'ASI05 - Unexpected Code Execution',
          'ASI07 - Insecure Inter-Agent Communication',
          'ASI10 - Rogue Agents',
        ],
        'soc-2': [
          'CC5.2: General controls over technology',
          'CC6.1: Logical access security',
          'CC6.6: Protection against external threats',
          'CC6.7: Secure transmission and removal',
          'CC6.8: Malicious software prevention',
        ],
      },
    },
    {
      id: 'B009',
      title: 'Limit output over-exposure',
      domain: 'B',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/security/limit-output-over-exposure',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement output limitations and obfuscation techniques to safeguard against information leakage.',
      keywords: [
        'Output Obfuscation',
        'Fidelity Reduction',
        'Information Leakage',
        'Adversarial Use',
        'Response Filtering',
      ],
      capabilities: ['Text-generation', 'Voice-generation', 'Image-generation'],
      activities: [
        {
          required: 'core',
          activity:
            'Reducing or limiting the number of results shown in outputs to relevant only to balance security and utility. For example, character limits, limits on inference time.',
        },
        {
          required: 'supplemental',
          activity:
            'Providing user-facing notices or documentation about output limitations.',
        },
        {
          required: 'supplemental',
          activity:
            'Limiting the fidelity of model outputs in certain use cases. For example, applying output rounding, threshold bands, or obfuscation techniques to reduce the risk of model inversion.',
        },
      ],
      evidence: [
        {
          id: 'B009.1',
          kind: 'config',
          title: 'Output volume limits',
          required: 'core',
          category: 'technical-implementation',
          locations: [
            'Engineering Code',
            'Product',
            'Text-generation',
            'Voice-generation',
            'Image-generation',
          ],
          description:
            'Code or configuration implementing output restrictions - may include character or token limits, inference time limits, result count restrictions, or timeout configurations preventing excessive output. Can be demonstrated by product demo showing system timeout when requesting output exceeding limits.',
        },
        {
          id: 'B009.2',
          kind: 'demonstration',
          title: 'User output notices',
          required: 'supplemental',
          category: 'operational-practices',
          locations: [
            'Product',
            'Text-generation',
            'Voice-generation',
            'Image-generation',
          ],
          description:
            'Product interface showing user notices about output limitations - may include messages indicating truncated or suppressed outputs for security or privacy reasons, user documentation explaining limitation policies, or help articles describing output restrictions.',
        },
        {
          id: 'B009.3',
          kind: 'config',
          title: 'Output precision controls',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: [
            'Engineering Code',
            'Text-generation',
            'Voice-generation',
            'Image-generation',
          ],
          description:
            'Code implementing output fidelity limitations - may include rounding logic for numerical outputs, threshold bands reducing precision, or obfuscation techniques preventing model inversion, precision-sensitive data disclosure, or adversarial model extraction attacks.',
        },
      ],
      crosswalks: {
        'mitre-atlas': ['AML-M0002: Passive AI Output Obfuscation'],
        'nist-ai-rmf': ['MEASURE 2.10: Privacy risk assessment'],
        'owasp-top-10': [
          'LLM02:25 - Sensitive Information Disclosure',
          'LLM05:25 - Improper Output Handling',
          'LLM08:25 - Vector and Embedding Weaknesses',
          'LLM09:25 - Misinformation',
        ],
        'csa-aicm': ['AIS-09: Output Validation'],
        'ibm-ai-risk-atlas': [
          'IBM 47: Inference - Prompt leaking',
          'IBM 74: Output - Revealing confidential information',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-4.2: Context Boundary Attacks',
          'AITech-8.1: Membership Inference',
          'AITech-8.2: Data Exfiltration / Exposure',
          'AITech-8.3: Information Disclosure',
          'AITech-8.4: Prompt/Meta Extraction',
          'AITech-10.2: Model Inversion',
          'AITech-12.2: Insecure Output Handling',
        ],
        'soc-2': [
          'CC8.1: Change management',
          'PI1.4: Output delivery accuracy',
        ],
      },
    },
    {
      id: 'B010',
      title: 'Promote secure patterns in generated code',
      domain: 'B',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/security/promote-secure-code-patterns',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement safeguards to promote secure patterns and prevent known vulnerabilities in generated code.',
      capabilities: ['Code-generation'],
      activities: [
        {
          required: 'core',
          activity:
            'Implementing safeguards to promote secure patterns for common web vulnerability classes in generated code. For example, defaulting to parameterized queries or safe ORM patterns for database access, applying output encoding and contextual escaping to prevent cross-site scripting, or enforcing HTTPS/TLS in generated network and API code.',
        },
        {
          required: 'core',
          activity:
            'Implementing safeguards to promote secure patterns for authentication and authorization in generated code. For example, defaulting to vetted authentication libraries or patterns on auth-related prompts, applying access control checks and least-privilege patterns by default, or avoiding generation of custom cryptographic or authentication primitives.',
        },
        {
          required: 'core',
          activity:
            'Implementing safeguards to prevent dependency risks in generated code. For example, avoiding wildcard version specifications (e.g., \\* or latest) in generated manifests, verifying that suggested packages exist in their respective registries before including them in generated code, or applying guidance that avoids known-abandoned or typosquatted packages.',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing safeguards to promote secure defaults for session management in generated code. For example, applying HttpOnly, Secure, and SameSite flags to session cookies by default, or defaulting to CSRF protections on state-changing endpoints.',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing safeguards to promote defensive programming patterns in generated code. For example, defaulting to input validation on user-supplied data, applying safe error handling that avoids exposing stack traces or internal details, or defaulting to rate limiting on generated public-facing endpoints.',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing safeguards to prevent generated logging code from capturing secrets or personal information. For example, defaulting logging patterns to exclude sensitive fields, or applying guidance that avoids logging full request bodies or auth headers.',
        },
      ],
      evidence: [
        {
          id: 'B010.1',
          kind: 'config',
          title: 'Secure defaults for common vulnerability classes',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Code-generation'],
          description:
            'Code, configuration, or system prompt excerpt demonstrating secure defaults for common vulnerability classes, may include system prompt guidance directing the model toward parameterized queries and safe ORM patterns, framework scaffolding that applies output encoding by default, or sample generations on database or UI prompts showing safe patterns used without explicit user request.',
        },
        {
          id: 'B010.2',
          kind: 'config',
          title: 'Secure defaults for authentication and authorization',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Code-generation'],
          description:
            'Code, configuration, or system prompt excerpt demonstrating secure defaults for auth, may include system prompt guidance directing the model toward established auth libraries (e.g., Auth0, Clerk, framework-native auth), or sample generations on auth-related prompts showing vetted patterns rather than custom implementations.',
        },
        {
          id: 'B010.3',
          kind: 'config',
          title: 'Safe dependency specification in generated code',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Code-generation'],
          description:
            'Code, configuration, or system prompt excerpt demonstrating safe dependency specification, may include system prompt guidance directing the model toward pinned versions and verified packages, registry validation logic checking generated package names against known registries, or sample generations showing appropriate version specifications across ecosystems.',
        },
        {
          id: 'B010.4',
          kind: 'config',
          title: 'Secure session and cookie defaults',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Code-generation'],
          description:
            'Code, configuration, or sample generations showing secure session and cookie defaults in generated code, may include system prompt guidance, framework scaffolding configuration, or sample generations on session-management-related prompts.',
        },
        {
          id: 'B010.5',
          kind: 'config',
          title: 'Input validation and error handling defaults',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Code-generation'],
          description:
            'Code, configuration, or sample generations showing input validation and error handling defaults, may include system prompt guidance, framework scaffolding patterns, or sample generations on prompts generating user-facing endpoints.',
        },
        {
          id: 'B010.6',
          kind: 'config',
          title: 'Logging defaults in generated code',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Logs', 'Code-generation'],
          description:
            'Code, configuration, or sample generations showing safe logging defaults in generated code, may include system prompt guidance, logging templates used in scaffolding, or sample generations on logging-related prompts.',
        },
      ],
      crosswalks: {
        'soc-2': [
          'CC5.2: General controls over technology',
          'CC6.8: Malicious software prevention',
          'CC7.1: Vulnerability detection and monitoring',
        ],
      },
    },
    {
      id: 'C001',
      title: 'Define AI risk taxonomy',
      domain: 'C',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/safety/define-ai-risk-taxonomy',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Establish a risk taxonomy based on system capabilities and deployment context.',
      keywords: ['Risk Taxonomy', 'Severity Rating'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Defining risk categories with severity levels and examples based on industry and deployment context. For example, classifying harmful outputs such as distressed outputs, angry responses, high-risk advice, offensive content, bias, and deception, identifying other high-risk use cases such as safety-critical instructions, legal recommendations, financial advice.',
        },
        {
          required: 'core',
          activity:
            'Aligning risk taxonomy with external frameworks and standards.',
        },
        {
          required: 'core',
          activity:
            'Establishing severity grading appropriate to organizational context and risk tolerance. For example, implementing consistent scoring methodology across risk categories, defining thresholds for flagging and human review.',
        },
        {
          required: 'core',
          activity:
            'Maintaining taxonomy currency with documented change management. For example, updating based on emerging threats or incidents.',
        },
      ],
      evidence: [
        {
          id: 'C001.1',
          kind: 'documentation',
          title: 'AI risk taxonomy',
          required: 'core',
          category: 'operational-practices',
          locations: ['Internal policies', 'Universal'],
          description:
            'Internal policy document, risk framework, or taxonomy defining AI risk categories with severity levels and examples specific to deployment context. Example taxonomies to draw upon include NIST AI RMF functions, EU AI Act article 9, ISO42001 controls.',
        },
        {
          id: 'C001.2',
          kind: 'documentation',
          title: 'Risk taxonomy reviews',
          required: 'core',
          category: 'operational-practices',
          locations: ['Internal processes', 'Universal'],
          description:
            'Meeting notes, change log, or review documentation showing annnual reviews of the risk taxonomy. Could include review dates, participants, decisions made (categories added/removed/modified, threshold adjustments), rationale for changes, approvals records, and version history showing taxonomy updates over time with timestamps. Can be standalone or part of broader internal audit/review or change management procedures.',
        },
      ],
      crosswalks: {
        'eu-ai-act': ['Article 9: Risk Management System'],
        'iso-42001': [
          'A.5.2: AI system impact assessment process',
          'A.5.3: Documentation of AI system impact assessments',
          'A.5.4: Assessing AI system impact on individuals or groups of individuals',
          'A.5.5: Assessing societal impacts of AI systems',
          '4.1: Understanding the organization and its context',
          '6.1.1: Actions to address risks and opportunities — General',
          '6.1.2: AI risk assessment',
          '6.1.3: AI risk treatment',
          '6.1.4: AI system impact assessment',
          '8.2: AI risk assessment',
          '8.3: AI risk treatment',
          '8.4: AI system impact assessment',
        ],
        'nist-ai-rmf': [
          'GOVERN 1.3: Risk management processes',
          'GOVERN 1.4: Risk management governance',
          'GOVERN 4.2: Risk documentation',
          'GOVERN 6.1: Third-party risk policies',
          'MANAGE 1.2: Risk prioritization',
          'MANAGE 1.3: Risk response planning',
          'MANAGE 1.4: Residual risk documentation',
          'MAP 1.5: Risk tolerance',
          'MAP 5.1: Impact assessment',
          'MEASURE 1.1: Risk metrics selection',
          'MEASURE 2.10: Privacy risk assessment',
          'MEASURE 2.11: Fairness and bias',
          'MEASURE 3.1: Emergent risk tracking',
        ],
        'csa-aicm': [
          'A\\&A-05: Audit Management Process',
          'A\\&A-06: Remediation',
          'BCR-02: Risk Assessment and Impact Analysis',
          'CEK-07: Encryption Risk Management',
          'DSP-09: Data Protection Impact Assessment',
          'GRC-02: Risk Management Program',
          'MDS-11: Model Failure',
          'CCC-03: Change Management Technology',
          'MDS-12: Open Model Risk Assessment',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 67: Output - Nonconsensual use',
          'IBM 69: Output - Improper usage',
          'IBM 83: Non-Technical - Incomplete usage definition',
          'IBM 84: Non-Technical - Unrepresentative risk testing',
          'IBM 85: Non-Technical - Incorrect risk testing',
          'IBM 86: Non-Technical - Lack of testing diversity',
        ],
        'co-ai-act': [
          '6-1-1702: Developer Duties',
          '6-1-1703: Deployer Duties',
        ],
        'ca-sb-53': ['22757.12: Transparency & Reporting Obligations'],
        'soc-2': [
          'CC3.1: Clear objectives for risk assessment',
          'CC3.2: Identify and analyze risks',
          'CC5.1: Select and develop control activities',
        ],
      },
    },
    {
      id: 'C002',
      title: 'Conduct pre-deployment testing',
      domain: 'C',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/safety/conduct-pre-deployment-testing',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Conduct internal testing of AI systems prior to deployment across risk categories for system changes requiring formal review or approval.',
      keywords: ['Internal Testing', 'Pre-Deployment Testing'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Conducting pre-deployment testing with documented results and identified issues. For example, structured hallucination testing, adversarial prompting, safety unit tests, and scenario-based walkthroughs.',
        },
        {
          required: 'core',
          activity:
            'Completing risk assessments of identified issues before system deployment. For example, potential impact analysis, mitigation strategies, and residual risk evaluation.',
        },
        {
          required: 'core',
          activity:
            'Obtaining approval sign-offs from designated accountable. For example, documented rationale for approval decisions and maintained records for review purposes.',
        },
        {
          required: 'supplemental',
          activity:
            'Integrating AI system testing into established software development lifecycle (SDLC) gates. For example, including threat modelling and risk evaluation during design phases, requiring risk evaluation and sign-off at staging or pre-production milestones, aligning with CI/CD or MLOps pipelines, and documenting test artefacts in shared repositories."',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing pre-deployment vulnerability scanning of AI artifacts and dependencies. For example, scanning AI models and ML libraries for security vulnerabilities, validating runtime behavior for unsafe operations, and analyzing outputs for harmful content before deployment.',
        },
        {
          required: 'supplemental',
          activity:
            "Testing changes to open-weight model before deployment. For example, re-running safety evaluations and guardrail test suites after major weights update via fine-tuning or quantization, or inference engine changes and comparing results to the prior model's baseline, and running targeted or automated checks for routine or low-risk changes.",
        },
      ],
      evidence: [
        {
          id: 'C002.1',
          kind: 'documentation',
          title: 'Pre-deployment test and approval records',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Practice', 'Universal'],
          description:
            'Test results with identified issues and severity ratings, risk assessment with mitigation decisions, and approval sign-offs with rationale - may be combined in deployment gate documentation or provided as separate documents (e.g., test suite outputs from GitHub Actions/pytest, Jira/Linear tickets with risk assessment and approval, staging environment test reports, deployment checklist with sign-offs).',
        },
        {
          id: 'C002.2',
          kind: 'config',
          title: 'SDLC integration',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Practice', 'Universal'],
          description:
            'CI/CD pipeline configuration or workflow showing AI testing integrated as deployment gate - may include GitHub Actions/Jenkins/GitLab CI config files requiring test passage, pull request templates with testing checklists, or branch protection rules enforcing pre-deployment validation.',
        },
        {
          id: 'C002.3',
          kind: 'documentation',
          title: 'Vulnerability scan results',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Tooling', 'Universal'],
          description:
            'Security scanning tools or CI/CD pipeline showing vulnerability analysis of AI artifacts and dependencies - may include GitHub/GitLab security tab with dependency alerts, Snyk or Dependabot vulnerability findings, pip-audit or safety check terminal output showing CVE scans, model file scanning results, or CI/CD logs showing security scan execution.',
        },
        {
          id: 'C002.4',
          kind: 'documentation',
          title: 'Open-weight model change regression testing',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Practice', 'Universal'],
          description:
            'Documented testing approach and results for the model change identifying the prior and new model version, the risk categories tested, and regression results - may include evaluation suite outputs before and after the change, automated check results for low-risk changes, or guardrail test suite pass rates.',
        },
      ],
      crosswalks: {
        'mitre-atlas': ['AML-M0016: Vulnerability Scanning'],
        'eu-ai-act': [
          'Article 9: Risk Management System',
          'Article 27: Fundamental Rights Impact Assessment for High-Risk AI Systems',
        ],
        'iso-42001': [
          'A.6.2.5: AI system deployment',
          'A.6.2.4: AI system verification and validation',
        ],
        'nist-ai-rmf': [
          'GOVERN 4.3: Testing and incident sharing',
          'MANAGE 1.1: Purpose achievement',
          'MAP 4.2: Internal risk controls',
          'MEASURE 2.1: TEVV documentation',
          'MEASURE 2.3: Performance demonstration',
          'MEASURE 2.5: Validity and reliability',
          'MEASURE 4.3: Performance tracking',
        ],
        'csa-aicm': [
          'AIS-05: Application Security Testing',
          'AIS-06: Secure Application Deployment',
          'AIS-07: Application Vulnerability Remediation',
          'AIS-12: Source Code Management',
          'CCC-02: Quality Testing',
          'AIS-04: Secure Application Development Lifecycle',
          'TVM-05: External Library Vulnerabilities',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 11: Agentic AI - Incomplete AI agent evaluation',
          'IBM 84: Non-Technical - Unrepresentative risk testing',
          'IBM 85: Non-Technical - Incorrect risk testing',
          'IBM 86: Non-Technical - Lack of testing diversity',
        ],
        'cisco-ai-security-safety-framework': ['AITech-15.1: Harmful Content'],
        'co-ai-act': [
          '6-1-1702: Developer Duties',
          '6-1-1703: Deployer Duties',
        ],
        'ca-sb-53': ['22757.12: Transparency & Reporting Obligations'],
        'soc-2': [
          'CC3.2: Identify and analyze risks',
          'CC8.1: Change management',
        ],
      },
    },
    {
      id: 'C003',
      title: 'Prevent harmful outputs',
      domain: 'C',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/safety/prevent-harmful-outputs',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement safeguards or technical controls to prevent harmful outputs including distressed outputs, angry responses, high-risk advice, offensive content, bias, and deception.',
      keywords: [
        'Harmful Outputs',
        'Distressed',
        'Angry',
        'Advice',
        'Offensive',
        'Bias',
      ],
      capabilities: ['Text-generation', 'Voice-generation', 'Image-generation'],
      activities: [
        {
          required: 'core',
          activity:
            'Implementing content filtering for harmful output types. For example, detecting and blocking distressed responses, angry language, offensive content, biased statements, and deceptive information.',
        },
        {
          required: 'core',
          activity:
            'Implementing guardrails for advice generation. For example, restricting high-risk recommendations in sensitive domains, requiring disclaimers for guidance.',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing bias detection and mitigation controls. For example, monitoring for discriminatory patterns, implementing fairness checks in outputs.',
        },
        {
          required: 'supplemental',
          activity:
            'Evaluating harm mitigation controls using performance metrics.',
        },
      ],
      evidence: [
        {
          id: 'C003.1',
          kind: 'config',
          title: 'Harmful output filtering',
          required: 'core',
          category: 'technical-implementation',
          locations: [
            'Eng: LLM output filtering logic',
            'Text-generation',
            'Voice-generation',
            'Image-generation',
          ],
          description:
            'Content filtering rules, moderation API configuration, or classifier settings showing detection and blocking logic for harmful output types - may include filtering rules in code, third-party moderation tool configuration (e.g., OpenAI Moderation API, Perspective API), or custom classifier model settings with harm category definitions.',
        },
        {
          id: 'C003.2',
          kind: 'config',
          title: 'Guardrails for high-risk advice',
          required: 'core',
          category: 'technical-implementation',
          locations: [
            'Engineering Code',
            'Text-generation',
            'Voice-generation',
            'Image-generation',
          ],
          description:
            'System prompts, guardrail rules, or domain restrictions showing safety controls on advice generation - may include defensive prompting, domain-specific output restrictions (e.g., medical/legal/financial advice blocklists), or conditional response templates that add warnings for sensitive topics.',
        },
        {
          id: 'C003.3',
          kind: 'config',
          title: 'Guardrails for biased outputs',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: [
            'Eng: LLM output filtering logic',
            'Text-generation',
            'Voice-generation',
            'Image-generation',
          ],
          description:
            'Documentation of bias eval results testing for stereotypical responses across demographic attributes, manual review logs documenting bias assessments, or output filtering rules blocking discriminatory patterns - may include automated fairness evaluation tools or bias monitoring dashboards if implemented.',
        },
        {
          id: 'C003.4',
          kind: 'documentation',
          title: 'Filtering performance benchmarks',
          required: 'supplemental',
          category: 'operational-practices',
          locations: [
            'Internal processes',
            'Text-generation',
            'Voice-generation',
            'Image-generation',
          ],
          description:
            'Test results, metrics dashboard, or evaluation report showing performance of harm controls - may include false positive/negative rates, coverage analysis of test scenarios, benchmark results against harm datasets (e.g., ToxiGen, RealToxicityPrompts), or confusion matrices showing filtering accuracy across harm categories.',
        },
      ],
      crosswalks: {
        'eu-ai-act': ['Article 9: Risk Management System'],
        'nist-ai-rmf': ['MEASURE 2.11: Fairness and bias'],
        'owasp-top-10': [
          'LLM05:25 - Improper Output Handling',
          'LLM09:25 - Misinformation',
        ],
        'csa-aicm': [
          'AIS-09: Output Validation',
          'GRC-11: Bias and Fairness Assessment',
          'GRC-09: Acceptable Use of the AI Service',
          'LOG-15: Output Monitoring',
          'TVM-11: Guardrails',
        ],
        'owasp-aivss': ['Agent Goal and Instruction Manipulation'],
        'ibm-ai-risk-atlas': [
          'IBM 58: Output - Decision bias',
          'IBM 59: Output - Output bias',
          'IBM 60: Output - Harmful output',
          'IBM 62: Output - Toxic output',
          'IBM 66: Output - Spreading disinformation',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-2.1: Jailbreak',
          'AITech-4.2: Context Boundary Attacks',
          'AITech-12.2: Insecure Output Handling',
          'AITech-15.1: Harmful Content',
        ],
        'co-ai-act': [
          '6-1-1702: Developer Duties',
          '6-1-1703: Deployer Duties',
        ],
        'owasp-agentic-top-10': ['ASI09 - Human-Agent Trust Exploitation'],
        'soc-2': [
          'CC5.1: Select and develop control activities',
          'PI1.4: Output delivery accuracy',
        ],
      },
    },
    {
      id: 'C004',
      title: 'Prevent out-of-scope outputs',
      domain: 'C',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/safety/prevent-out-of-scope-outputs',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement safeguards or technical controls to prevent out-of-scope outputs (e.g. political discussion, healthcare advice).',
      keywords: ['Out-of-Scope', 'Political Discussion', 'Technical Controls'],
      capabilities: ['Text-generation', 'Voice-generation'],
      activities: [
        {
          required: 'core',
          activity:
            'Detecting and blocking out-of-scope requests. For example, detecting conversations outside intended use cases, blocking prohibited topics, providing redirection messages when users hit boundaries, and escalating or restricting access for repeated violations.',
        },
        {
          required: 'core',
          activity:
            'Tracking out-of-scope violations and updating boundaries. For example, logging boundary violations, adjusting restrictions based on misuse patterns.',
        },
        {
          required: 'supplemental',
          activity:
            "Providing user guidance on system capabilities and limitations. For example, communicating what the AI system can and cannot do, intended use cases, and topics or requests outside the system's scope.",
        },
      ],
      evidence: [
        {
          id: 'C004.1',
          kind: 'config',
          title: 'out-of-scope guardrails',
          required: 'core',
          category: 'technical-implementation',
          locations: [
            'Engineering Code',
            'Text-generation',
            'Voice-generation',
          ],
          description:
            'Blocking rules, defensive prompting, or filtering configuration showing how out-of-scope requests are detected and handled - may include topic blocklists, redirection message templates, escalation rules for repeated attempts, or system prompts defining allowed topics.',
        },
        {
          id: 'C004.2',
          kind: 'logs',
          title: 'Out-of-scope attempts',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Logs', 'Text-generation', 'Voice-generation'],
          description:
            'Logs showing out-of-scope attempts with frequency data. May include documentation of boundary updates made in response to violations, monitoring dashboard of flagged requests, change log showing restriction updates with rationale, or incident reports triggering scope adjustments.',
        },
        {
          id: 'C004.3',
          kind: 'demonstration',
          title: 'User guidance on scope',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Product', 'Text-generation', 'Voice-generation'],
          description:
            'User-facing guidance explaining system capabilities and limitations - may include onboarding tooltips or welcome screens, help documentation or FAQs describing intended use, UI warnings when approaching scope boundaries, or published usage guidelines.',
        },
      ],
      crosswalks: {
        'eu-ai-act': [
          'Article 72: Post-Market Monitoring by Providers and Post-Market Monitoring Plan for High-Risk AI Systems',
        ],
        'nist-ai-rmf': [
          'MAP 2.2: Knowledge limits',
          'MAP 3.4: Operator proficiency',
        ],
        'owasp-top-10': ['LLM05:25 - Improper Output Handling'],
        'csa-aicm': [
          'AIS-09: Output Validation',
          'GRC-09: Acceptable Use of the AI Service',
          'LOG-15: Output Monitoring',
          'TVM-11: Guardrails',
        ],
        'owasp-aivss': ['Agent Goal and Instruction Manipulation'],
        'ibm-ai-risk-atlas': ['IBM 69: Output - Improper usage'],
        'cisco-ai-security-safety-framework': [
          'AITech-1.1: Direct Prompt Injection',
          'AITech-2.1: Jailbreak',
          'AITech-15.1: Harmful Content',
        ],
        'soc-2': [
          'CC5.1: Select and develop control activities',
          'PI1.4: Output delivery accuracy',
        ],
      },
    },
    {
      id: 'C005',
      title: 'Prevent agent-specific high risk outputs',
      domain: 'C',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/safety/prevent-other-high-risk-outputs',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement safeguards or technical controls to prevent agent-specific high-risk outputs as defined in risk taxonomy.',
      keywords: ['High-Risk Outputs', 'Risk Taxonomy', 'Technical Controls'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Implementing detection and blocking mechanisms aligned with organizational risk taxonomy. For example, deploying filtering based on defined risk categories and severity thresholds.',
        },
        {
          required: 'core',
          activity:
            'Implementing response actions for detected risks. For example, blocking high-severity outputs, flagging medium-risk content for review, logging violations for monitoring and analysis.',
        },
        {
          required: 'supplemental',
          activity:
            'Establishing escalation procedures for flagged high-risk content. For example, defining when human review is required and establishing approval workflows for edge cases.',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing automated real-time interventions. For example, blocking or modifying outputs based on severity.',
        },
      ],
      evidence: [
        {
          id: 'C005.1',
          kind: 'config',
          title: 'Risk detection and response',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Eng: LLM output filtering logic', 'Universal'],
          description:
            'Filtering rules, system configuration, or code showing detection logic mapped to AI risk taxonomy categories and corresponding response actions per severity level - may include risk classifiers with block/flag/log rules, content moderation API configuration defining actions by risk type, or defensive prompting.',
        },
        {
          id: 'C005.2',
          kind: 'documentation',
          title: 'Human review workflows',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Practice', 'Universal'],
          description:
            'Documentation or workflow configuration showing human review and escalation procedures for flagged content - may include runbook defining escalation criteria and review SLAs, workflow diagram showing approval process, or ticketing system configuration (Jira, Linear) with content review queues and assignment rules.',
        },
        {
          id: 'C005.3',
          kind: 'config',
          title: 'Automated response mechanisms',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            'Code or system configuration showing automated response mechanisms - may include logic blocking or modifying outputs based on risk scores, or dynamic warning messages triggered by content flags.',
        },
      ],
      crosswalks: {
        'eu-ai-act': ['Article 9: Risk Management System'],
        'nist-ai-rmf': ['MANAGE 1.4: Residual risk documentation'],
        'owasp-top-10': ['LLM05:25 - Improper Output Handling'],
        'csa-aicm': [
          'GRC-09: Acceptable Use of the AI Service',
          'LOG-15: Output Monitoring',
          'TVM-11: Guardrails',
          'STA-10: Primary Service and Contractual Agreement',
        ],
        'owasp-aivss': ['Agent Goal and Instruction Manipulation'],
        'ibm-ai-risk-atlas': [
          'IBM 60: Output - Harmful output',
          'IBM 61: Output - Harmful code generation',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-2.1: Jailbreak',
          'AITech-15.1: Harmful Content',
        ],
        'soc-2': [
          'CC3.2: Identify and analyze risks',
          'CC5.1: Select and develop control activities',
          'PI1.4: Output delivery accuracy',
        ],
      },
    },
    {
      id: 'C006',
      title: 'Prevent output vulnerabilities',
      domain: 'C',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/safety/prevent-output-vulnerabilities',
      cadence_months: 3,
      type: 'preventative',
      summary:
        'Implement safeguards to prevent security vulnerabilities in outputs from impacting users.',
      keywords: ['Harmful Outputs', 'Code Injection', 'Data Exfiltration'],
      capabilities: ['Code-generation', 'Text-generation', 'Voice-generation'],
      activities: [
        {
          required: 'core',
          activity:
            'Establishing output sanitization and validation procedures before presenting content to users. For example, encoding or stripping potentially malicious content, validating structured outputs against safe schemas, blocking unsafe URLs, and enforcing secure rendering modes.',
        },
        {
          required: 'core',
          activity:
            'Implementing content handling and security labelling based on trust level. For example, marking untrusted or third-party content, distinguishing external data from system-generated content, and applying differentiated security controls based on content source.',
        },
        {
          required: 'supplemental',
          activity:
            'Detecting advanced output-based attack patterns. For example, identifying prompt injection attempts, model subversion techniques, payloads targeting downstream systems, or obfuscated exploits designed to bypass filters.',
        },
      ],
      evidence: [
        {
          id: 'C006.1',
          kind: 'config',
          title: 'Output sanitization',
          required: 'core',
          category: 'technical-implementation',
          locations: [
            'Engineering Code',
            'Code-generation',
            'Text-generation',
            'Voice-generation',
          ],
          description:
            'Code or configuration implementing output sanitization - may include HTML/JavaScript/shell syntax encoding functions, URL validation or rewriting rules blocking unsafe links, schema validation checking structured outputs (JSON/YAML/XML) against whitelists, CSP header configuration, or template rendering with auto-escaping enabled.',
        },
        {
          id: 'C006.2',
          kind: 'demonstration',
          title: 'Content handling and labelling for untrusted content',
          required: 'core',
          category: 'technical-implementation',
          locations: [
            'Product',
            'Code-generation',
            'Text-generation',
            'Voice-generation',
          ],
          description:
            'UI or code showing trust-based content handling - may include visual indicators marking third-party content (badges, styling, warning icons), metadata tags tracking content source and trust level, or code applying conditional security controls based on content origin (e.g., stricter sanitization for external sources).',
        },
        {
          id: 'C006.3',
          kind: 'config',
          title: 'Adversarial output detection',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: [
            'Eng: LLM output filtering logic',
            'Code-generation',
            'Text-generation',
            'Voice-generation',
          ],
          description:
            'Detection rules or monitoring system identifying advanced attack patterns in outputs - may include pattern matching for prompt injection chains or jailbreak tokens, payload signature scanning detecting command injection or SQL queries, or anomaly detection flagging obfuscated exploits bypassing basic filters.',
        },
      ],
      crosswalks: {
        'mitre-atlas': ['AML-M0020: Generative AI Guardrails'],
        'eu-ai-act': [
          'Article 72: Post-Market Monitoring by Providers and Post-Market Monitoring Plan for High-Risk AI Systems',
        ],
        'owasp-top-10': ['LLM05:25 - Improper Output Handling'],
        'csa-aicm': [
          'AIS-09: Output Validation',
          'TVM-02: Malware and Malicious Instructions Protection Policy and Procedure',
          'AIS-07: Application Vulnerability Remediation',
        ],
        'owasp-aivss': ['Insecure Agent Critical Systems Interaction'],
        'ibm-ai-risk-atlas': ['IBM 61: Output - Harmful code generation'],
        'cisco-ai-security-safety-framework': [
          'AITech-1.4: Multi-Modal Injection and Manipulation',
          'AITech-4.3: Protocol Manipulation',
        ],
        'owasp-agentic-top-10': ['ASI05 - Unexpected Code Execution'],
        'soc-2': [
          'CC6.8: Malicious software prevention',
          'PI1.4: Output delivery accuracy',
        ],
      },
    },
    {
      id: 'C007',
      title: 'Flag high risk outputs for human review',
      domain: 'C',
      application: 'optional',
      retired: false,
      url: 'https://standard.aiuc-1.com/safety/flag-high-risk-recommendations',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement an alerting system that flags high-risk outputs for human review.',
      keywords: ['Human Review', 'Escalation'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Defining high-risk output criteria drawing on risk taxonomy.',
        },
        {
          required: 'core',
          activity:
            'Implementing automated detection mechanisms for high-risk outputs. For example, using content filtering, risk scoring, or classification models to identify outputs requiring review or flagging.',
        },
        {
          required: 'supplemental',
          activity:
            'Establishing human review workflows for flagged high-risk outputs. For example, assigning reviewers, defining escalation procedures for complex cases, managing review queues with response time tracking, documenting review decisions, and reviewing workflow effectiveness regularly.',
        },
      ],
      evidence: [
        {
          id: 'C007.1',
          kind: 'documentation',
          title: 'Definition of high-risk output criteria',
          required: 'core',
          category: 'operational-practices',
          locations: ['Internal policies', 'Universal'],
          description:
            'Document or policy defining high-risk outputs requiring human review - should specify criteria for flagging (e.g. financial advice thresholds, medical/legal/safety domains, reputational harm triggers). Can be standalone or included in existing AI risk taxonomy/AI risk policy.',
        },
        {
          id: 'C007.2',
          kind: 'config',
          title: 'High-risk detection mechanisms',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            'Detection code, configuration file, or rules engine showing high-risk output filtering - may include keyword lists or regex patterns flagging sensitive topics, scoring logic assigning risk values to recommendations, if/then rules defining high-risk conditions, ML model configuration (e.g., classification thresholds in config.yaml), or API response showing confidence scores with risk thresholds.',
        },
        {
          id: 'C007.3',
          kind: 'documentation',
          title: 'Human review workflows',
          required: 'supplemental',
          category: 'operational-practices',
          locations: ['Internal processes', 'Universal'],
          description:
            'Workflow documentation or ticketing system configuration showing human review process for flagged outputs - may include runbook with reviewer assignments and escalation paths, queue management in Jira/Linear/support ticketing with pending review tracking, SLA targets for review response times, or procedure document defining review decision documentation requirements.',
        },
      ],
      crosswalks: {
        'mitre-atlas': ['AML-M0020: Generative AI Guardrails'],
        'nist-ai-rmf': [
          'GOVERN 3.2: Human-AI oversight',
          'MAP 3.5: Human oversight',
        ],
        'csa-aicm': ['GRC-15: Human supervision'],
        'iso-42001': [
          'A.6.1.2: Objectives for responsible development of AI system',
          'A.9.3: Objectives for responsible use of AI system',
          'A.9.2: Processes for responsible use of AI systems',
        ],
        'owasp-aivss': ['Agent Untraceability'],
        'ibm-ai-risk-atlas': [
          'IBM 4: Agentic AI - Over- or under-reliance on AI agents',
          'IBM 64: Output - Over- or under-reliance',
        ],
        'owasp-agentic-top-10': ['ASI09 - Human-Agent Trust Exploitation'],
        'soc-2': ['PI1.3: Processing controls'],
      },
    },
    {
      id: 'C008',
      title: 'Monitor AI risk categories',
      domain: 'C',
      application: 'optional',
      retired: false,
      url: 'https://standard.aiuc-1.com/safety/monitor-ai-risk-categories',
      cadence_months: 12,
      type: 'detective',
      summary: 'Implement monitoring of AI systems across risk categories.',
      keywords: ['Monitoring', 'High-Risk Outputs'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Establishing ongoing monitoring of AI outputs across risk categories. For example, conducting regular evaluations prioritized by risk severity, sampling outputs for review, and tracking system behavior patterns.',
        },
        {
          required: 'supplemental',
          activity:
            'Maintaining documentation. For example, recording identified scenarios with clear examples, updating risk taxonomy based on monitoring findings and incidents.',
        },
        {
          required: 'supplemental',
          activity:
            'Integrating AI output monitoring with existing security tools. For example, forwarding alerts and flagged outputs to SIEM platforms, applying standard logging formats (e.g. JSON, syslog) to support automated threat detection workflows.',
        },
      ],
      evidence: [
        {
          id: 'C008.1',
          kind: 'logs',
          title: 'AI risk monitoring',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Tooling', 'Universal'],
          description:
            'Monitoring dashboard, logging system, or evaluation reports showing ongoing AI output tracking - may include output sampling logs with review results, behavior trace logs showing system patterns, prompt-response logging configuration, evaluation schedules prioritized by risk severity, or monitoring metrics dashboard tracking trends over time.',
        },
        {
          id: 'C008.2',
          kind: 'documentation',
          title: 'Monitoring findings',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Practice', 'Universal'],
          description:
            'Document or change log showing identified risk scenarios with examples - may include incident reports triggering taxonomy changes, risk scenario database with concrete examples, or version history of risk taxonomy showing updates with rationale linked to monitoring findings.',
        },
        {
          id: 'C008.3',
          kind: 'config',
          title: 'Security tooling',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Tooling', 'Universal'],
          description:
            'SIEM integration, log forwarding configuration, or security tool settings showing AI monitoring data flowing into existing security infrastructure - may include Splunk/Datadog/Elastic forwarding rules for AI alerts, JSON/syslog format configuration for AI logs, or SIEM dashboard showing AI-related events alongside other security telemetry.',
        },
      ],
      crosswalks: {
        'eu-ai-act': [
          'Article 72: Post-Market Monitoring by Providers and Post-Market Monitoring Plan for High-Risk AI Systems',
        ],
        'iso-42001': [
          'A.5.4: Assessing AI system impact on individuals or groups of individuals',
          'A.6.2.6: AI system operation and monitoring',
          'A.9.4: Intended use of the AI system',
          '6.1.1: Actions to address risks and opportunities — General',
          '6.1.2: AI risk assessment',
          '6.1.3: AI risk treatment',
          '8.2: AI risk assessment',
          '8.3: AI risk treatment',
          '9.1: Monitoring, measurement, analysis and evaluation',
          'A.9.2: Processes for responsible use of AI systems',
        ],
        'nist-ai-rmf': [
          'GOVERN 1.5: Risk monitoring and review',
          'MANAGE 3.1: Third-party monitoring',
          'MANAGE 4.1: Post-deployment monitoring',
          'MEASURE 2.4: Production monitoring',
          'MEASURE 4.3: Performance tracking',
        ],
        'csa-aicm': [
          'GRC-02: Risk Management Program',
          'MDS-11: Model Failure',
          'TVM-03: Vulnerability Remediation Schedule',
          'MDS-12: Open Model Risk Assessment',
          'TVM-07: Vulnerability Remediation Schedule',
        ],
        'owasp-aivss': ['Agent Untraceability'],
        'ibm-ai-risk-atlas': ['IBM 85: Non-Technical - Incorrect risk testing'],
        'co-ai-act': [
          '6-1-1702: Developer Duties',
          '6-1-1703: Deployer Duties',
        ],
        'soc-2': [
          'CC2.1: Use of relevant, quality information',
          'CC3.2: Identify and analyze risks',
          'CC7.2: Anomaly monitoring',
          'CC7.3: Security event evaluation',
        ],
      },
    },
    {
      id: 'C009',
      title: 'Enable real-time feedback and intervention',
      domain: 'C',
      application: 'optional',
      retired: false,
      url: 'https://standard.aiuc-1.com/safety/collect-real-time-feedback',
      cadence_months: 3,
      type: 'preventative',
      summary:
        'Implement mechanisms to enable real-time user feedback collection, intervention and actioning mechanisms.',
      keywords: ['Feedback', 'Intervention', 'User Control', 'Transparency'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Enabling user intervention capabilities. For example, providing mechanisms for users to pause, stop, or redirect system behavior, implementing feedback collection tools for users to report issues or concerns, ensuring technical controls persist across devices and interaction contexts.',
        },
        {
          required: 'core',
          activity:
            'Ensuring accessibility of feedback and intervention mechanisms. For example, adhering to WCAG 2.1 standards for color contrast, screen reader compatibility, keyboard navigation, and clear messaging for users with disabilities.',
        },
        {
          required: 'supplemental',
          activity:
            'Reviewing user feedback and intervention logs at regular intervals, analyzing findings using structured methodologies (e. g., categorizing by risk domain, frequency, and severity), and integrating corrective actions into product backlogs or compliance workflows, with records maintained for traceability.',
        },
      ],
      evidence: [
        {
          id: 'C009.1',
          kind: 'demonstration',
          title: 'User intervention mechanisms',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Product', 'Universal'],
          description:
            'Intervention controls (stop/pause/redirect buttons, feedback forms, issue reporting mechanisms) with accessibility features integrated (e.g. keyboard navigation, high contrast modes, screen reader labels)',
        },
        {
          id: 'C009.2',
          kind: 'documentation',
          title: 'User feedback & intervention reviews',
          required: 'supplemental',
          category: 'operational-practices',
          locations: ['Internal processes', 'Universal'],
          description:
            'Logs, reports, or dashboard showing review, analysis and actioning of user feedback and intervention patterns - may include feedback summary reports, intervention frequency analysis, categorization by risk domain, documentation of system changes made in response to patterns, or integration with product backlog/compliance workflows.',
        },
      ],
      crosswalks: {
        'eu-ai-act': ['Article 14: Human Oversight'],
        'iso-42001': ['A.8.3: External reporting'],
        'nist-ai-rmf': [
          'GOVERN 3.2: Human-AI oversight',
          'MAP 3.5: Human oversight',
          'MEASURE 3.3: User feedback systems',
        ],
        'csa-aicm': ['GRC-15: Human supervision'],
        'ibm-ai-risk-atlas': [
          'IBM 4: Agentic AI - Over- or under-reliance on AI agents',
          "IBM 20: Agentic AI - AI agents' impact on human agency",
          'IBM 64: Output - Over- or under-reliance',
        ],
        'co-ai-act': ['6-1-1703: Deployer Duties'],
        'owasp-agentic-top-10': [
          'ASI01 - Agent Goal Hijack',
          'ASI09 - Human-Agent Trust Exploitation',
        ],
        'soc-2': [
          'PI1.1: Relevant processing information',
          'PI1.3: Processing controls',
        ],
      },
    },
    {
      id: 'C010',
      title: 'Third-party testing for safety risk',
      domain: 'C',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/safety/3rd-party-testing-for-harmful-outputs',
      cadence_months: 3,
      type: 'preventative',
      summary:
        'Appoint expert third-parties to evaluate system robustness to safety risk as defined in the AIUC-1 risk taxonomy at least every 3 months',
      keywords: [
        'Harmful Outputs',
        'Distressed',
        'Angry',
        'Advice',
        'Offensive',
        'Bias',
        'Risk Severity',
        'Toxigen',
        'Third-Party Testing',
      ],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Appointing qualified third-party assessors. Including selecting assessors with relevant technical capabilities for identified risk areas, maintaining records of assessor qualifications and independence.',
        },
        {
          required: 'core',
          activity:
            'Conducting regular testing. Including defining testing scope and methodologies based on risk taxonomy and performing assessments of high-risk areas at least every quarter.',
        },
        {
          required: 'core',
          activity:
            'Maintaining documentation. Including testing scope and results.',
        },
      ],
      evidence: [
        {
          id: 'C010.1',
          kind: 'evals',
          title: 'Third-party evaluation report assessing safety risk',
          required: 'core',
          category: 'third-party-evals',
          locations: ['Third-party evaluation report', 'Universal'],
          description:
            'Third-party evaluation report showing testing for safety risk - including risks tested (e.g., physical harm, emotional harm, inappropriate content, high-risk domain engagement, bias), testing methodology and findings',
        },
      ],
      crosswalks: {
        'nist-ai-rmf': [
          'GOVERN 4.3: Testing and incident sharing',
          'MANAGE 2.2: Deployed system value',
          'MEASURE 1.3: Independent assessment',
          'MEASURE 2.1: TEVV documentation',
          'MEASURE 2.6: Safety evaluation',
          'MEASURE 2.11: Fairness and bias',
          'MEASURE 4.1: Context-specific measurement',
          'MEASURE 4.2: Trustworthiness validation',
        ],
        'eu-ai-act': ['Article 9: Risk Management System'],
        'csa-aicm': [
          'GRC-11: Bias and Fairness Assessment',
          'A\\&A-02: Independent Assessments',
          'TVM-06: Penetration Testing',
        ],
        'iso-42001': ['A.6.2.4: AI system verification and validation'],
        'ibm-ai-risk-atlas': [
          'IBM 62: Output - Toxic output',
          'IBM 58: Output - Decision bias',
          'IBM 59: Output - Output bias',
          'IBM 60: Output - Harmful output',
          'IBM 84: Non-Technical - Unrepresentative risk testing',
        ],
        'cisco-ai-security-safety-framework': ['AITech-15.1: Harmful Content'],
        'nyc-ll-144': ['5-301: Conduct Bias Audit', '5-302: Manage Audit Data'],
        'co-ai-act': ['6-1-1703: Deployer Duties'],
        'owasp-agentic-top-10': ['ASI09 - Human-Agent Trust Exploitation'],
        'soc-2': [
          'CC2.3: External communication of controls',
          'CC4.1: Ongoing and separate evaluations',
        ],
      },
    },
    {
      id: 'C011',
      title: 'Third-party testing for out-of-scope outputs',
      domain: 'C',
      application: 'mandatory',
      retired: true,
      url: 'https://standard.aiuc-1.com/safety/3rd-party-testing-for-out-of-scope-outputs',
      retired_in: '2026.4',
      summary: 'Retired - see changelog (Q4 2026 update).',
      keywords: ['Out-of-Scope', 'Political Discussion', 'Third-Party Testing'],
      activities: [
        {
          required: 'core',
          activity:
            'This requirement was retired during the Q4, 2026 standard update. See aiuc-1.com/changelog for more information',
        },
      ],
      evidence: [
        {
          id: 'C011.1',
          kind: 'retired',
          title: 'Retired',
          required: 'core',
          description: 'Retired',
        },
      ],
      crosswalks: {
        'nist-ai-rmf': [
          'GOVERN 4.3: Testing and incident sharing',
          'MANAGE 2.2: Deployed system value',
          'MAP 2.2: Knowledge limits',
          'MEASURE 1.3: Independent assessment',
          'MEASURE 2.1: TEVV documentation',
          'MEASURE 2.6: Safety evaluation',
          'MEASURE 4.1: Context-specific measurement',
          'MEASURE 4.2: Trustworthiness validation',
        ],
        'iso-42001': ['A.6.2.4: AI system verification and validation'],
        'ibm-ai-risk-atlas': [
          'IBM 69: Output - Improper usage',
          'IBM 83: Non-Technical - Incomplete usage definition',
        ],
        'cisco-ai-security-safety-framework': ['AITech-15.1: Harmful Content'],
        'soc-2': [
          'CC2.3: External communication of controls',
          'CC4.1: Ongoing and separate evaluations',
        ],
      },
    },
    {
      id: 'C012',
      title: 'Third-party testing for customer-defined risk',
      domain: 'C',
      application: 'mandatory',
      retired: true,
      url: 'https://standard.aiuc-1.com/safety/3rd-party-testing-for-other-risk',
      retired_in: '2026.4',
      summary: 'Retired - see changelog (Q4 2026 update).',
      keywords: ['High-Risk Outputs', 'Risk Taxonomy', 'Third-Party Testing'],
      activities: [
        {
          required: 'core',
          activity:
            'This requirement was retired during the Q4, 2026 standard update. See aiuc-1.com/changelog for more information',
        },
      ],
      evidence: [
        {
          id: 'C012.1',
          kind: 'retired',
          title: 'Retired',
          required: 'core',
          description: 'Retired',
        },
      ],
      crosswalks: {
        'nist-ai-rmf': [
          'GOVERN 4.3: Testing and incident sharing',
          'MANAGE 2.2: Deployed system value',
          'MEASURE 1.3: Independent assessment',
          'MEASURE 2.1: TEVV documentation',
          'MEASURE 2.6: Safety evaluation',
          'MEASURE 4.1: Context-specific measurement',
          'MEASURE 4.2: Trustworthiness validation',
        ],
        'iso-42001': ['A.6.2.4: AI system verification and validation'],
        'csa-aicm': [
          'A\\&A-02: Independent Assessments',
          'TVM-06: Penetration Testing',
        ],
        'owasp-aivss': ['Agent Cascading Failures'],
        'ibm-ai-risk-atlas': [
          'IBM 84: Non-Technical - Unrepresentative risk testing',
          'IBM 85: Non-Technical - Incorrect risk testing',
          'IBM 86: Non-Technical - Lack of testing diversity',
        ],
        'cisco-ai-security-safety-framework': ['AITech-15.1: Harmful Content'],
        'ca-sb-53': ['22757.12: Transparency & Reporting Obligations'],
        'co-ai-act': ['6-1-1703: Deployer Duties'],
        'soc-2': [
          'CC2.3: External communication of controls',
          'CC4.1: Ongoing and separate evaluations',
        ],
      },
    },
    {
      id: 'D001',
      title: 'Prevent hallucinated outputs',
      domain: 'D',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/reliability/prevent-hallucinated-outputs',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement safeguards or technical controls to prevent hallucinated outputs.',
      keywords: ['Hallucinations', 'Technical Controls'],
      capabilities: ['Text-generation', 'Voice-generation', 'Code-generation'],
      activities: [
        {
          required: 'core',
          activity:
            'Implementing factual accuracy controls. For example, deploying available fact-checking mechanisms, flagging uncertain or low-confidence responses.',
        },
        {
          required: 'core',
          activity:
            'Establishing information source validation. For example, requiring citations for factual claims, implementing source reliability checks.',
        },
        {
          required: 'supplemental',
          activity:
            'Maintaining uncertainty communication. For example, displaying confidence levels, providing appropriate disclaimers for generated information.',
        },
      ],
      evidence: [
        {
          id: 'D001.1',
          kind: 'config',
          title: 'Groundedness filter',
          required: 'core',
          category: 'technical-implementation',
          locations: [
            'Engineering Code',
            'Text-generation',
            'Voice-generation',
            'Code-generation',
          ],
          description:
            'Code or configuration showing groundedness validation - may include filters checking responses against source documents, fact-checking API integration, or logic comparing generated content to retrieved context for factual accuracy.',
        },
        {
          id: 'D001.2',
          kind: 'demonstration',
          title: 'User-facing citations & source attributions',
          required: 'core',
          category: 'technical-implementation',
          locations: [
            'Product',
            'Text-generation',
            'Voice-generation',
            'Code-generation',
          ],
          description:
            'UI or output format showing citations and source attributions provided to users - may include inline citations, source links, reference lists, or attribution labels identifying where information originated.',
        },
        {
          id: 'D001.3',
          kind: 'demonstration',
          title: 'User-facing uncertainty labels',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: [
            'Product',
            'Text-generation',
            'Voice-generation',
            'Code-generation',
          ],
          description:
            'UI or output format showing confidence levels, uncertainty disclaimers, or warnings for generated information - may include confidence score displays, low-certainty warnings, or standard disclaimers about potential inaccuracies.',
        },
      ],
      crosswalks: {
        'nist-ai-rmf': ['MEASURE 2.5: Validity and reliability'],
        'owasp-top-10': [
          'LLM05:25 - Improper Output Handling',
          'LLM09:25 - Misinformation',
        ],
        'csa-aicm': [
          'AIS-09: Output Validation',
          'MDS-10: Model Continuous Monitoring',
          'MDS-11: Model Failure',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 40: Inference - Poor model accuracy',
          'IBM 63: Output - Incomplete advice',
          'IBM 71: Output - Hallucination',
          'IBM 76: Output - Unreliable source attribution',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-4.2: Context Boundary Attacks',
          'AITech-15.1: Harmful Content',
        ],
        'owasp-agentic-top-10': [
          'ASI08 - Cascading Failures',
          'ASI09 - Human-Agent Trust Exploitation',
        ],
        'soc-2': [
          'PI1.2: Input completeness and accuracy',
          'PI1.3: Processing controls',
          'PI1.4: Output delivery accuracy',
        ],
      },
    },
    {
      id: 'D002',
      title: 'Third-party testing for hallucinations',
      domain: 'D',
      application: 'mandatory',
      retired: true,
      url: 'https://standard.aiuc-1.com/reliability/3rd-party-testing-for-hallucinations',
      retired_in: '2026.4',
      summary: 'Retired - see changelog (Q4 2026 update).',
      keywords: ['Hallucinations', 'Third-Party Testing'],
      activities: [
        {
          required: 'core',
          activity:
            'This requirement was retired during the Q4, 2026 standard update. See aiuc-1.com/changelog for more information',
        },
      ],
      evidence: [
        {
          id: 'D002.1',
          kind: 'retired',
          title: 'Retired',
          required: 'core',
          description: 'Retired',
        },
      ],
      crosswalks: {
        'nist-ai-rmf': [
          'GOVERN 4.3: Testing and incident sharing',
          'MANAGE 2.2: Deployed system value',
          'MEASURE 1.3: Independent assessment',
          'MEASURE 2.1: TEVV documentation',
          'MEASURE 2.5: Validity and reliability',
          'MEASURE 4.1: Context-specific measurement',
          'MEASURE 4.2: Trustworthiness validation',
        ],
        'owasp-top-10': ['LLM09:25 - Misinformation'],
        'csa-aicm': [
          'AIS-09: Output Validation',
          'AIS-05: Application Security Testing',
          'MDS-06: Adversarial Attack Analysis',
          'MDS-07: Robustness against Adversarial Attack / Model Hardening',
        ],
        'iso-42001': ['A.6.2.4: AI system verification and validation'],
        'ibm-ai-risk-atlas': [
          'IBM 40: Inference - Poor model accuracy',
          'IBM 71: Output - Hallucination',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-4.2: Context Boundary Attacks',
          'AITech-15.1: Harmful Content',
        ],
        'owasp-agentic-top-10': [
          'ASI08 - Cascading Failures',
          'ASI09 - Human-Agent Trust Exploitation',
        ],
        'soc-2': [
          'CC2.3: External communication of controls',
          'CC4.1: Ongoing and separate evaluations',
          'PI1.3: Processing controls',
          'PI1.4: Output delivery accuracy',
        ],
      },
    },
    {
      id: 'D003',
      title: 'Restrict unsafe tool calls',
      domain: 'D',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/reliability/restrict-unsafe-tool-calls',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement safeguards or technical controls to prevent tool calls in AI systems from executing unauthorized actions, accessing restricted information, or making decisions beyond their intended scope.',
      keywords: ['Tool Calls', 'Tool Selection', 'Technical Controls'],
      capabilities: ['Automation'],
      activities: [
        {
          required: 'core',
          activity:
            'Implementing tool call validation and authorization. For example, restricting tool calls to approved functions and MCP servers, validating parameters before execution.',
        },
        {
          required: 'core',
          activity:
            'Enforcing rate limits and transaction caps for autonomous tool use.',
        },
        {
          required: 'core',
          activity:
            'Establishing execution monitoring and logging. For example, tracking all tool calls, monitoring for unauthorized access attempts or scope violations.',
        },
        {
          required: 'core',
          activity:
            'Requiring human approval for sensitive tool operations. For example, requiring human confirmation before executing high-risk actions, multi-step tool calls, implementing approval workflows for operations beyond autonomous boundaries.',
        },
        {
          required: 'supplemental',
          activity:
            'Reviewing patterns of AI tool usage. For example, identifying anomalies, updating tool permissions, and retiring unused or high-risk functions during scheduled evaluations.',
        },
      ],
      evidence: [
        {
          id: 'D003.1',
          kind: 'config',
          title: 'Tool authorization & validation',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Automation'],
          description:
            'Code or configuration showing function and tool allowlists, parameter validation logic, or authz checks before tool execution - may include tool permission schemas, input validation functions, or access control lists restricting available tools per agent/user.',
        },
        {
          id: 'D003.2',
          kind: 'config',
          title: 'Rate limits for tools',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Automation'],
          description:
            'Code or configuration showing rate limits and transaction caps on tool usage - may include per-tool usage quotas, time-windowed limits, or circuit breakers preventing excessive autonomous tool calls.',
        },
        {
          id: 'D003.3',
          kind: 'config',
          title: 'Tool call log',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Logs', 'Automation'],
          description:
            'Logging configuration, monitoring dashboard, or audit logs showing tracked tool calls - may include log entries capturing the originating MCP server, tool name, tool version, input parameters, and timestamps per invocation, alerts for unauthorized tool access attempts, or monitoring system flagging scope violations.',
        },
        {
          id: 'D003.4',
          kind: 'config',
          title: 'Human-approval workflows',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Practice', 'Automation'],
          description:
            'Approval workflow configuration, code or ticketing system for sensitive, high-risk, or multi-step tool operations requiring human confirmation (e.g., executing financial transactions, deleting or irreversibly modifying records, and changing credentials or permissions).',
        },
        {
          id: 'D003.5',
          kind: 'documentation',
          title: 'tool call log reviews',
          required: 'supplemental',
          category: 'operational-practices',
          locations: ['Internal processes', 'Automation'],
          description:
            'Reports or documentation showing periodic review of tool usage patterns, permission updates, and function retirement decisions - may include usage analytics identifying anomalies, change logs showing permission adjustments, or records of deprecated/retired tools with rationale.',
        },
      ],
      crosswalks: {
        'mitre-atlas': [
          'AML-M0004: Restrict Number of AI Model Queries',
          'AML-M0024: AI Telemetry Logging',
        ],
        'eu-ai-act': [
          'Article 72: Post-Market Monitoring by Providers and Post-Market Monitoring Plan for High-Risk AI Systems',
        ],
        'nist-ai-rmf': ['GOVERN 6.1: Third-party risk policies'],
        'owasp-top-10': [
          'LLM06:25 - Excessive Agency',
          'LLM08:25 - Vector and Embedding Weaknesses',
          'LLM10:25 - Unbounded Consumption',
        ],
        'csa-aicm': [
          'AIS-10: API Security',
          'AIS-06: Secure Application Deployment',
          'AIS-13: AI Sandboxing',
          'AIS-11: Agents Security Boundaries',
          'MDS-10: Model Continuous Monitoring',
          'MDS-11: Model Failure',
          'TVM-11: Guardrails',
          'TVM-12: Threat Analysis and Modeling',
        ],
        'owasp-aivss': ['Agentic AI Tool Misuse'],
        'ibm-ai-risk-atlas': [
          'IBM 5: Agentic AI - Misaligned actions',
          'IBM 7: Agentic AI - Unauthorized use',
          'IBM 9: Agentic AI - Function calling hallucination',
          'IBM 10: Agentic AI - Redundant actions',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-1.3: Goal Manipulation',
          'AITech-7.1: Reasoning Corruption',
          'AITech-12.1: Tool Exploitation',
          'AITech-14.2: Abuse of Delegated Authority',
        ],
        'owasp-agentic-top-10': [
          'ASI01 - Agent Goal Hijack',
          'ASI02 - Tool Misuse and Exploitation',
          'ASI03 - Identity and Privilege Abuse',
          'ASI05 - Unexpected Code Execution',
          'ASI08 - Cascading Failures',
          'ASI10 - Rogue Agents',
        ],
        'soc-2': [
          'CC5.1: Select and develop control activities',
          'PI1.2: Input completeness and accuracy',
          'PI1.3: Processing controls',
          'PI1.4: Output delivery accuracy',
        ],
      },
    },
    {
      id: 'D004',
      title: 'Third-party testing for reliability risk',
      domain: 'D',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/reliability/3rd-party-testing-of-tool-calls',
      cadence_months: 3,
      type: 'preventative',
      summary:
        'Appoint expert third-parties to evaluate system robustness to reliability risk as defined in the AIUC-1 risk taxonomy at least every 3 months',
      keywords: ['Tool Calls', 'Tool Selection', 'Third-Party Testing'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Appointing qualified third-party assessors. Including selecting assessors with relevant technical capabilities for identified risk areas, maintaining records of assessor qualifications and independence.',
        },
        {
          required: 'core',
          activity:
            'Conducting regular testing. Including defining testing scope and methodologies based on risk taxonomy and performing assessments of high-risk areas at least every quarter.',
        },
        {
          required: 'core',
          activity:
            'Maintaining documentation. Including testing scope and results.',
        },
      ],
      evidence: [
        {
          id: 'D004.1',
          kind: 'evals',
          title: 'Third-party evaluation report assessing reliability risk',
          required: 'core',
          category: 'third-party-evals',
          locations: ['Third-party evaluation report', 'Universal'],
          description:
            'Third-party evaluation report showing testing for reliability risk - including risks tested (e.g., hallucinations, source attribution, incorrectly executed tool actions), testing methodology and findings',
        },
      ],
      crosswalks: {
        'nist-ai-rmf': [
          'GOVERN 6.1: Third-party risk policies',
          'GOVERN 4.3: Testing and incident sharing',
          'MANAGE 2.2: Deployed system value',
          'MEASURE 1.3: Independent assessment',
          'MEASURE 2.1: TEVV documentation',
          'MEASURE 2.6: Safety evaluation',
          'MEASURE 4.1: Context-specific measurement',
          'MEASURE 4.2: Trustworthiness validation',
        ],
        'owasp-top-10': ['LLM06:25 - Excessive Agency'],
        'iso-42001': ['A.6.2.4: AI system verification and validation'],
        'csa-aicm': ['AIS-05: Application Security Testing'],
        'owasp-aivss': ['Agentic AI Tool Misuse'],
        'ibm-ai-risk-atlas': [
          'IBM 5: Agentic AI - Misaligned actions',
          'IBM 9: Agentic AI - Function calling hallucination',
          'IBM 11: Agentic AI - Incomplete AI agent evaluation',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-1.3: Goal Manipulation',
          'AITech-7.1: Reasoning Corruption',
          'AITech-7.2: Memory System Corruption',
          'AITech-12.1: Tool Exploitation',
        ],
        'owasp-agentic-top-10': [
          'ASI02 - Tool Misuse and Exploitation',
          'ASI05 - Unexpected Code Execution',
          'ASI10 - Rogue Agents',
        ],
        'soc-2': [
          'CC2.3: External communication of controls',
          'CC4.1: Ongoing and separate evaluations',
        ],
      },
    },
    {
      id: 'E001',
      title: 'AI failure plan for security breaches',
      domain: 'E',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/accountability/ai-failure-plan-for-security-breaches',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Document AI failure plan for AI privacy and security breaches assigning accountable owners and establishing notification and remediation with third-party support as needed (e.g. legal, PR, insurers).',
      keywords: [
        'Incident Response',
        'Security',
        'Privacy',
        'Regulatory Deadlines',
      ],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Assigning a breach response lead from existing staff. For example, IT manager, security officer, or designated executive with authority to engage external counsel and specialists as needed.',
        },
        {
          required: 'core',
          activity:
            'Defining breach notification procedures. For example, customer communications, regulatory reporting requirements, and vendor notifications based on applicable privacy laws.',
        },
        {
          required: 'core',
          activity:
            'Implementing security remediation measures. For example, system freeze capabilities, vulnerability fixes, access control updates, and coordination with external security consultants when internal expertise is insufficient.',
        },
        {
          required: 'core',
          activity:
            'Establishing evidence collection requirements with guidance on preserving evidence for potential legal review. For example, system logs, user activity records, and basic documentation.',
        },
      ],
      evidence: [
        {
          id: 'E001.1',
          kind: 'documentation',
          title: 'AI failure plan for security breaches',
          required: 'core',
          category: 'operational-practices',
          locations: ['AI failure plan', 'Universal'],
          description:
            'Can be standalone document or integrated in existing incident response procedures/policies',
        },
      ],
      crosswalks: {
        'eu-ai-act': [
          'Article 20: Corrective Actions and Duty of Information',
          'Article 73: Reporting of Serious Incidents',
        ],
        'iso-42001': [
          'A.8.4: Communication of incidents',
          'A.8.5: Information for interested parties',
        ],
        'nist-ai-rmf': [
          'GOVERN 4.3: Testing and incident sharing',
          'MANAGE 1.3: Risk response planning',
          'MANAGE 4.3: Incident communication',
        ],
        'csa-aicm': [
          'BCR-09: Disaster Response Plan',
          'BCR-10: Response Plan Exercise',
          'SEF-01: Security Incident Management Policy and Procedures',
          'SEF-02: Service Management Policy and Procedures',
          'SEF-03: Incident Response Plans',
          'SEF-04: Incident Response Testing',
          'SEF-05: Incident Response Metrics',
          'SEF-07: Security Breach Notification',
          'SEF-08: Points of Contact Maintenance',
          'SEF-09: Incident Response',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 12: Agentic AI - Mitigation and maintenance',
          'IBM 89: Non-Technical - Legal accountability',
        ],
        'owasp-agentic-top-10': [
          'ASI08 - Cascading Failures',
          'ASI10 - Rogue Agents',
        ],
        'soc-2': [
          'CC4.2: Evaluate and communicate deficiencies',
          'CC7.3: Security event evaluation',
          'CC7.4: Incident response',
          'CC7.5: Recovery from incidents',
          'P6.3: Record of unauthorized disclosures',
          'P6.5: Vendor breach notification commitments',
          'P6.6: Breach notification obligations',
        ],
      },
    },
    {
      id: 'E002',
      title: 'AI failure plan for harmful outputs',
      domain: 'E',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/accountability/ai-failure-plan-for-harmful-outputs',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Document AI failure plan for harmful AI outputs that cause significant customer harm assigning accountable owners and establishing remediation with third-party support as needed (e.g. legal, PR, insurers).',
      keywords: [
        'Incident Response',
        'Emergency Response',
        'Harmful Outputs',
        'Hallucinations',
        'Vendors',
      ],
      capabilities: ['External-facing'],
      activities: [
        {
          required: 'core',
          activity:
            'Implementing customer communication protocols. For example, disclosure procedures, explanation of corrective actions, and follow-up commitments with executive approval for significant incidents.',
        },
        {
          required: 'core',
          activity:
            'Establishing immediate mitigation steps with designated staff responsibilities. For example, system freeze capabilities, output suppression, customer notification, and system adjustments.',
        },
        {
          required: 'supplemental',
          activity:
            'Defining harmful output categories with reference to risk taxonomy. For example, discriminatory content, offensive material, inappropriate recommendations, ideally with concrete examples.',
        },
        {
          required: 'supplemental',
          activity:
            'Coordinating external support engagement. For example, legal counsel consultation, PR support, and insurance claim procedures.',
        },
      ],
      evidence: [
        {
          id: 'E002.1',
          kind: 'documentation',
          title: 'AI failure plan for harmful outputs',
          required: 'core',
          category: 'operational-practices',
          locations: ['AI failure plan', 'External-facing'],
          description:
            'Can be standalone document or integrated in existing incident response procedures/policies',
        },
        {
          id: 'E002.2',
          kind: 'documentation',
          title: 'Additional harmful output failure procedures',
          required: 'supplemental',
          category: 'operational-practices',
          locations: ['AI failure plan', 'External-facing'],
          description:
            'May include harmful output category definitions referenced to risk taxonomy, external support contact list (legal counsel, PR firms, insurance providers), support engagement procedures or runbooks, or escalation criteria for involving external parties.',
        },
      ],
      crosswalks: {
        'eu-ai-act': [
          'Article 20: Corrective Actions and Duty of Information',
          'Article 73: Reporting of Serious Incidents',
        ],
        'iso-42001': ['A.8.4: Communication of incidents'],
        'nist-ai-rmf': [
          'GOVERN 4.3: Testing and incident sharing',
          'MANAGE 1.3: Risk response planning',
          'MANAGE 4.3: Incident communication',
        ],
        'csa-aicm': [
          'BCR-09: Disaster Response Plan',
          'BCR-10: Response Plan Exercise',
          'SEF-09: Incident Response',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 12: Agentic AI - Mitigation and maintenance',
          'IBM 60: Output - Harmful output',
          'IBM 89: Non-Technical - Legal accountability',
        ],
        'co-ai-act': ['6-1-1702: Developer Duties'],
        'ca-sb-53': ['22757.13: Critical Safety Incident Reporting'],
        'owasp-agentic-top-10': ['ASI08 - Cascading Failures'],
        'soc-2': [
          'CC4.2: Evaluate and communicate deficiencies',
          'CC7.4: Incident response',
        ],
      },
    },
    {
      id: 'E003',
      title: 'AI failure plan for hallucinations',
      domain: 'E',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/accountability/ai-failure-plan-for-hallucinations',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Document AI failure plan for hallucinated AI outputs that cause substantial customer financial loss assigning accountable owners and establishing remediation with third-party support as needed (e.g. legal, PR, insurers).',
      keywords: ['Hallucinations', 'Incident Response', 'Customer Loss'],
      capabilities: ['External-facing'],
      activities: [
        {
          required: 'core',
          activity:
            'Implementing customer communication protocols. For example, disclosure procedures, explanation of corrective actions, and follow-up commitments with executive approval for significant incidents.',
        },
        {
          required: 'core',
          activity:
            'Establishing immediate mitigation steps with designated staff responsibilities. For example, system freeze capabilities, model adjustments, output validation improvements, customer notification, and enhanced monitoring.',
        },
        {
          required: 'supplemental',
          activity: 'Defining hallucination incident types.',
        },
        {
          required: 'supplemental',
          activity:
            'Coordinating potential external support. For example, legal consultation for significant claims, financial review when needed, and insurance coverage activation.',
        },
      ],
      evidence: [
        {
          id: 'E003.1',
          kind: 'documentation',
          title: 'AI failure plan for hallucinations',
          required: 'core',
          category: 'operational-practices',
          locations: ['AI failure plan', 'External-facing'],
          description:
            'Can be standalone document or integrated in existing incident response procedures/policies',
        },
        {
          id: 'E003.2',
          kind: 'documentation',
          title: 'Additional hallucination failure procedures',
          required: 'supplemental',
          category: 'operational-practices',
          locations: ['AI failure plan', 'External-facing'],
          description:
            'May include hallucination incident categories (e.g. factual errors, incorrect recommendations), external support contact list (legal counsel, financial reviewers, insurance providers), support engagement procedures, or escalation criteria for involving external parties.',
        },
      ],
      crosswalks: {
        'eu-ai-act': [
          'Article 20: Corrective Actions and Duty of Information',
          'Article 73: Reporting of Serious Incidents',
        ],
        'iso-42001': ['A.8.4: Communication of incidents'],
        'nist-ai-rmf': [
          'GOVERN 4.3: Testing and incident sharing',
          'MANAGE 1.3: Risk response planning',
          'MANAGE 4.3: Incident communication',
        ],
        'csa-aicm': [
          'BCR-09: Disaster Response Plan',
          'BCR-10: Response Plan Exercise',
          'SEF-09: Incident Response',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 9: Agentic AI - Function calling hallucination',
          'IBM 71: Output - Hallucination',
          'IBM 89: Non-Technical - Legal accountability',
        ],
        'owasp-agentic-top-10': ['ASI08 - Cascading Failures'],
        'soc-2': [
          'CC4.2: Evaluate and communicate deficiencies',
          'CC7.4: Incident response',
        ],
      },
    },
    {
      id: 'E004',
      title: 'Assign accountability',
      domain: 'E',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/accountability/assign-accountability',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Document which AI system changes across the development & deployment lifecycle require formal review or approval, assign a lead accountable for each, and document their approval with supporting evidence.',
      keywords: ['Decision Owners', 'Deployment'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Defining AI system changes requiring approval including model selection, material changes to the meta prompt, adding / removing guardrails, changes to end-user workflow, other changes that drive material. For example, +/-10% performance on evals.',
        },
        {
          required: 'core',
          activity:
            'Assigning an accountable lead as approver for each of these changes. Can follow a RACI structure to formalize roles of those consulted and informed.',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing code signing and verification processes for AI models, libraries, and deployment artefacts to ensure only digitally signed components are approved for production use.',
        },
      ],
      evidence: [
        {
          id: 'E004.1',
          kind: 'documentation',
          title: 'Change approval policy and records',
          required: 'core',
          category: 'operational-practices',
          locations: ['Internal policies', 'Universal'],
          description:
            'Documentation or policy defining which AI system changes require approval with assigned accountable leads, and approval records showing sign-offs with supporting evidence. Can be a change management policy, overview table in e.g. Notion, approval logs from Jira/Linear/GitHub, or deployment gate documentation.',
        },
        {
          id: 'E004.2',
          kind: 'config',
          title: 'Code signing implementation',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Engineering Practice', 'Universal'],
          description:
            'Code signing configuration, CI/CD pipeline requiring signed artifacts, or verification process for AI components - may include model signing process, signature verification in deployment pipeline, artifact registry showing signed models/libraries, or policy enforcement blocking unsigned components from production.',
        },
      ],
      crosswalks: {
        'mitre-atlas': ['AML-M0013: Code Signing'],
        'eu-ai-act': [
          'Article 17: Quality Management System',
          'Article 18: Documentation Keeping',
        ],
        'iso-42001': [
          'A.3.2: AI roles and responsibilities',
          'A.4.6: Human resources',
          'A.6.2.2: AI system requirements and specification',
          'A.10.2: Allocating responsibilities',
          '5.1: Leadership and commitment',
          '5.3: Roles, responsibilities and authorities',
          '7.2: Competence',
        ],
        'nist-ai-rmf': [
          'GOVERN 2.1: Roles and responsibilities',
          'GOVERN 2.3: Executive accountability',
          'MAP 3.5: Human oversight',
          'MEASURE 2.8: Transparency and accountability',
        ],
        'csa-aicm': [
          'AIS-01: Application and Interface Security Policy and Procedures',
          'AIS-04: Secure Application Development Lifecycle',
          'CCC-05: Change Agreements',
          'CCC-03: Change Management Technology',
          'CEK-02: CEK Roles and Responsibilities',
          'GRC-06: Governance Responsibility Model',
          'CCC-01: Change Management Policy and Procedures',
          'MDS-09: Model Signing/Ownership Verification',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 15: Agentic AI - Accountability of AI agent actions',
          'IBM 89: Non-Technical - Legal accountability',
        ],
        'soc-2': [
          'CC1.3: Structures, authorities, and responsibilities',
          'CC1.5: Accountability for internal control',
          'CC5.3: Deploy controls through policies',
          'CC8.1: Change management',
        ],
      },
    },
    {
      id: 'E005',
      title: 'Document data storage security',
      domain: 'E',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/accountability/assess-cloud-vs-on-prem-processing',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Document data storage security practices considering data sensitivity, regulatory requirements, security controls, and operational needs.',
      keywords: [
        'Deployment',
        'Cloud Security',
        'On-Premise Security',
        'Data Residency',
      ],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Documenting data storage security. For example, assessments around cloud vs. on-premises processing.',
        },
      ],
      evidence: [
        {
          id: 'E005.1',
          kind: 'documentation',
          title: 'Data storage security practices',
          required: 'core',
          category: 'operational-practices',
          locations: ['Internal processes', 'Universal'],
          description:
            'Documenting data storage security practices against data sensitivity, regulatory requirements, and operational needs - may include security trust center documentation, deployment decision memos such as cloud vs. on-prem evaluations, risk assessment reports, and records of periodic reviews when requirements changed.',
        },
      ],
      crosswalks: {
        'mitre-atlas': ['AML-M0017: AI Model Distribution Methods'],
        'nist-ai-rmf': ['MAP 4.2: Internal risk controls'],
        'owasp-top-10': ['LLM03:25 - Supply Chain'],
        'csa-aicm': [
          'AIS-05: Application Security Testing',
          'DCS-01: Off-Site Equipment Disposal Policy and Procedures',
          'DCS-02: Off-Site Transfer Authorization Policy and Procedures',
          'DCS-03: Secure Area Policy and Procedures',
          'DCS-04: Secure Media Transportation Policy and Procedures',
          'DCS-05: Assets Classification',
          'DCS-06: Assets Cataloguing and Tracking',
          'DCS-07: Controlled Physical Access Points',
          'DCS-08: Equipment Identification',
          'DCS-09: Secure Area Authorization',
          'DCS-10: Surveillance System',
          'DCS-11: Adverse Event Response Training',
          'DCS-12: Cabling Security',
          'DCS-13: Environmental Systems',
          'DCS-14: Secure Utilities',
          'DCS-15: Equipment Location',
        ],
        'owasp-aivss': ['Agent Supply Chain and Dependency Risk'],
        'ibm-ai-risk-atlas': [
          'IBM 36: Training Data - Data usage restrictions',
          'IBM 37: Training Data - Data transfer restrictions',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-14.1: Unauthorized Access',
        ],
        'soc-2': [
          'C1.1: Identify and maintain confidential information',
          'CC6.1: Logical access security',
        ],
      },
    },
    {
      id: 'E006',
      title: 'Conduct vendor and model due diligence',
      domain: 'E',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/accountability/conduct-vendor-due-diligence',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Establish due diligence processes for foundation and upstream model providers covering data handling, PII controls, security and compliance.',
      keywords: [
        'Vendor Due Diligence',
        'Open-Source',
        'Foundation Models',
        'Upstream Models',
      ],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Defining assessment criteria for foundational or upstream AI models. For example, data handling and ownership practices, PII controls, security measures, compliance status, open-source.',
        },
        {
          required: 'core',
          activity:
            'Conducting documented assessments. For example, scoring results, verification activities such as certifications reviewed and references contacted, and approval decisions.',
        },
        {
          required: 'core',
          activity:
            'Maintaining assessment records with sufficient detail for audit purposes and retaining due diligence evidence before vendor approval.',
        },
        {
          required: 'supplemental',
          activity:
            "Verifying the source, integrity and licence of the open-weight model before use. For example, obtaining weights from the publisher's own repository or a vetted registry, verifying published checksums or signatures, checking for known issues with the model version, confirming the licence permits the intended use and identifying the base model for fine-tuned derivatives.",
        },
      ],
      evidence: [
        {
          id: 'E006.1',
          kind: 'documentation',
          title: 'Vendor due diligence',
          required: 'core',
          category: 'operational-practices',
          locations: ['Vendor Contracts', 'Internal processes', 'Universal'],
          description:
            'Vendor assessment records showing evaluation criteria, scoring results, verification activities, approval decisions with accountable leads, and retained evidence supporting the assessment. May include vendor questionnaires, security reviews, compliance documentation, or due diligence reports.',
        },
        {
          id: 'E006.2',
          kind: 'documentation',
          title: 'Open-weight model source, integrity and licence verification',
          required: 'supplemental',
          category: 'operational-practices',
          locations: ['Internal processes', 'Universal'],
          description:
            'Assessment records showing the source, integrity and license checks performed on the open-weight model - may include a model intake checklist identifying publisher, repository or registry, model version and base model for fine-tuned derivatives, checksum or signature verification output, and licence and known-issue review notes.',
        },
      ],
      crosswalks: {
        'eu-ai-act': [
          'Article 23: Obligations of Importers',
          'Article 24: Obligations of Distributors',
        ],
        'iso-42001': ['A.10.3: Suppliers'],
        'nist-ai-rmf': ['MAP 4.2: Internal risk controls'],
        'owasp-top-10': ['LLM03:25 - Supply Chain'],
        'csa-aicm': [
          'STA-01: Supply Chain Risk Management Policies and Procedures',
          'STA-08: Supply Chain Inventory',
          'STA-09: Supply Chain Risk Management',
          'STA-10: Primary Service and Contractual Agreement',
          'STA-11: Supply Chain Agreement Review',
          'STA-12: Supply Chain Compliance Assessment',
          'STA-13: Supply Chain Service Agreement Compliance',
          'STA-14: Supply Chain Governance Review',
          'STA-15: Supply Chain Data Security Assessment',
        ],
        'owasp-aivss': ['Agent Supply Chain and Dependency Risk'],
        'ibm-ai-risk-atlas': [
          'IBM 16: Agentic AI - AI agent compliance',
          'IBM 34: Training Data - Uncertain data provenance',
          'IBM 39: Training Data - Data usage rights restrictions',
          'IBM 88: Non-Technical - Model usage rights restrictions',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-4.1: Agent Injection',
          'AITech-9.3: Dependency / Plugin Compromise',
        ],
        'owasp-agentic-top-10': [
          'ASI04 - Agentic Supply Chain Vulnerabilities',
        ],
        'soc-2': [
          'CC9.2: Vendor and partner risk',
          'P6.4: Vendor privacy commitments',
          'P6.5: Vendor breach notification commitments',
        ],
      },
    },
    {
      id: 'E007',
      title: 'Document system change approvals',
      domain: 'E',
      application: 'optional',
      retired: true,
      url: 'https://standard.aiuc-1.com/accountability/document-system-change-approvals',
      retired_in: '2026.4',
      summary: 'Merged with E004 - see changelog (Q1 2026 update).',
      keywords: ['Approvals', 'Workflows'],
      activities: [
        {
          required: 'core',
          activity:
            'This requirement was merged into E004 at the Q1, 2026 standard update. See aiuc-1.com/changelog for more information',
        },
      ],
      evidence: [
        {
          id: 'E007.1',
          kind: 'retired',
          title: 'Retired',
          required: 'core',
          description: 'Retired',
        },
      ],
      crosswalks: {
        'eu-ai-act': [
          'Article 17: Quality Management System',
          'Article 18: Documentation Keeping',
        ],
        'nist-ai-rmf': [
          'GOVERN 2.1: Roles and responsibilities',
          'GOVERN 2.3: Executive accountability',
          'MANAGE 1.1: Purpose achievement',
          'MAP 3.5: Human oversight',
          'MEASURE 2.8: Transparency and accountability',
          'MEASURE 4.3: Performance tracking',
        ],
        'csa-aicm': [
          'CCC-01: Change Management Policy and Procedures',
          'CCC-03: Change Management Technology',
          'CCC-04: Change Authorization',
          'CCC-05: Change Agreements',
          'CCC-06: Change Management Baseline',
          'AIS-01: Application and Interface Security Policy and Procedures',
        ],
        'iso-42001': [
          'A.6.2.2: AI system requirements and specification',
          'A.6.2.4: AI system verification and validation',
          '6.3: Planning of changes',
        ],
      },
    },
    {
      id: 'E008',
      title: 'Review internal processes',
      domain: 'E',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/accountability/review-internal-processes',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Establish regular internal reviews of key processes and document review records and approvals.',
      keywords: ['Internal Reviews', 'Documentation'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Reviewing decision processes every quarter including AI system changes, foundational model selection, security assessment.',
        },
        {
          required: 'core',
          activity:
            'Maintaining a centralized repository of decision records and internal review of these record. For example, supporting evidence reviewed, remediation plans.',
        },
        {
          required: 'core',
          activity:
            'Documenting and tracking remediation of any risks identified.',
        },
        {
          required: 'supplemental',
          activity:
            'Collecting and implementing external feedback on AI systems. For example, system risks, new threat patterns, new mitigation strategies.',
        },
      ],
      evidence: [
        {
          id: 'E008.1',
          kind: 'documentation',
          title: 'Internal review',
          required: 'core',
          category: 'operational-practices',
          locations: ['Internal processes', 'Universal'],
          description:
            'Centralized repository, policy, or tickets showing quarterly internal reviews - e.g. review meeting notes or calendars, decision logs in Jira/Notion/Confluence, risk registers with remediation status, threat modelling outcomes, or audit trails of review activities.',
        },
        {
          id: 'E008.2',
          kind: 'documentation',
          title: 'External feedback integration',
          required: 'supplemental',
          category: 'operational-practices',
          locations: ['Internal processes', 'Universal'],
          description:
            'Documentation showing external feedback collected and implemented - may include external security advisories reviewed, threat intelligence integrated, third-party recommendations adopted, or records of external input incorporated into system improvements.',
        },
      ],
      crosswalks: {
        'eu-ai-act': ['Article 43: Conformity Assessment'],
        'iso-42001': [
          'A.3.3: Reporting of concerns',
          'A.2.3: Alignment with other organizational policies',
          'A.2.4: Review of the AI policy',
          '6.3: Planning of changes',
          '7.5.2: Creating and updating documented information',
          '9.2.1: Internal audit - General',
          '9.2.2: Internal audit programme',
          '9.3.1: Management review - General',
          '9.3.2: Management review inputs',
          '9.3.3: Management review results',
        ],
        'nist-ai-rmf': [
          'GOVERN 1.7: AI system decommissioning',
          'GOVERN 5.2: Feedback integration',
          'GOVERN 5.1: External feedback',
          'MANAGE 4.2: Continual improvement',
          'MEASURE 1.2: Metric appropriateness',
          'MEASURE 2.13: TEVV effectiveness',
        ],
        'csa-aicm': [
          'A\\&A-02: Independent Assessments',
          'A\\&A-03: Risk Based Planning Assessment',
          'A\\&A-05: Audit Management Process',
          'A\\&A-06: Remediation',
          'BCR-01: Business Continuity Management Policy and Procedures',
          'CEK-09: Encryption and Key Management Audit',
          'DSP-09: Data Protection Impact Assessment',
          'GRC-03: Organizational Policy Reviews',
          'IAM-03: Identity Inventory',
          'IAM-08: User Access Review',
          'LOG-07: Logging Scope',
          'A\\&A-01: Audit and Assurance Policy and Procedures',
          'AIS-02: Application Security Baseline Requirements',
          'AIS-01: Application and Interface Security Policy and Procedures',
          'CCC-09: Change Restoration',
        ],
        'ibm-ai-risk-atlas': ['IBM 85: Non-Technical - Incorrect risk testing'],
        'ca-sb-53': ['22757.12: Transparency & Reporting Obligations'],
        'soc-2': [
          'CC1.3: Structures, authorities, and responsibilities',
          'CC4.1: Ongoing and separate evaluations',
          'CC4.2: Evaluate and communicate deficiencies',
          'CC5.3: Deploy controls through policies',
          'CC8.1: Change management',
        ],
      },
    },
    {
      id: 'E009',
      title: 'Monitor third-party access',
      domain: 'E',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/accountability/monitor-3rd-party-access',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement systems to monitor and log third-party API connections, sessions, and data access.',
      keywords: ['Access', 'Logins'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Configuring logging for third-party interactions. For example, capturing API connections, user access sessions, data exchanges, and service integrations.',
        },
        {
          required: 'core',
          activity:
            'Capturing access metadata. For example, user identification, authentication timestamps, accessed resources, session duration, origin IP addresses, and resource usage patterns.',
        },
        {
          required: 'supplemental',
          activity:
            'Generating alerts on anomalous third-party access patterns against defined detection rules. For example, alerting on unexpected call volume or out-of-scope endpoints for service connections, repeated failed logins for human access, or credential use outside approved scope - with each alert routed to a responsible owner for disposition.',
        },
      ],
      evidence: [
        {
          id: 'E009.1',
          kind: 'config',
          title: 'Third-party access monitoring',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Tooling', 'Universal'],
          description:
            'Logging system or SIEM configuration showing third-party interactions being monitored with captured metadata - may include cloud logging interface (Google Cloud Logging, AWS CloudWatch, Azure Monitor) showing logged API requests with timestamps/IPs/user agents, access logs capturing authentication events and resource access, or SIEM dashboard displaying third-party connection monitoring with relevant metadata fields.',
        },
        {
          id: 'E009.2',
          kind: 'config',
          title: 'Anomalous third-party access alerting',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Tooling', 'Universal'],
          description:
            'Detection-rule or SIEM configuration for anomalous third-party access - may include alerting rules or correlation logic defining anomalous-access conditions, plus sample fired alerts showing disposition (case assignment, triage notes, or resolution records).',
        },
      ],
      crosswalks: {
        'mitre-atlas': ['AML-M0024: AI Telemetry Logging'],
        'eu-ai-act': [
          'Article 72: Post-Market Monitoring by Providers and Post-Market Monitoring Plan for High-Risk AI Systems',
        ],
        'nist-ai-rmf': [
          'GOVERN 1.5: Risk monitoring and review',
          'MANAGE 4.1: Post-deployment monitoring',
        ],
        'owasp-top-10': [
          'LLM03:25 - Supply Chain',
          'LLM05:25 - Improper Output Handling',
          'LLM06:25 - Excessive Agency',
          'LLM10:25 - Unbounded Consumption',
        ],
        'csa-aicm': [
          'AIS-10: API Security',
          'LOG-05: Audit Logs Monitoring and Response',
          'UEM-14: Third-Party Endpoint Security Posture',
          'TVM-05: External Library Vulnerabilities',
        ],
        'owasp-aivss': ['Agent Supply Chain and Dependency Risk'],
        'ibm-ai-risk-atlas': [
          'IBM 3: Agentic AI - Sharing IP/PI/confidential information with tools',
          'IBM 6: Agentic AI - Attack on AI agents’ external resources',
          'IBM 7: Agentic AI - Unauthorized use',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-1.2: Indirect Prompt Injection',
          'AITech-3.1: Masquerading / Obfuscation / Impersonation',
          'AITech-4.1: Agent Injection',
          'AITech-7.3: Data Source Abuse and Manipulation',
          'AITech-9.1: Model or Agentic System Manipulation',
          'AITech-9.3: Dependency / Plugin Compromise',
          'AITech-12.1: Tool Exploitation',
          'AITech-14.1: Unauthorized Access',
          'AITech-16.1: Eavesdropping',
        ],
        'owasp-agentic-top-10': [
          'ASI02 - Tool Misuse and Exploitation',
          'ASI03 - Identity and Privilege Abuse',
          'ASI04 - Agentic Supply Chain Vulnerabilities',
          'ASI07 - Insecure Inter-Agent Communication',
        ],
        'soc-2': [
          'CC6.2: User registration and deprovisioning',
          'CC7.1: Vulnerability detection and monitoring',
          'CC9.2: Vendor and partner risk',
        ],
      },
    },
    {
      id: 'E010',
      title: 'Establish AI acceptable use policy',
      domain: 'E',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/accountability/establish-ai-acceptable-use-policy',
      cadence_months: 12,
      type: 'preventative',
      summary: 'Establish and implement an AI acceptable use policy.',
      keywords: ['Acceptable Use', 'Breach'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Defining prohibited AI usage for end-users. For example, jailbreak attempts, malicious prompt injection, unauthorized data extraction, generation of harmful content, and misuse of customer data.',
        },
        {
          required: 'core',
          activity:
            'Implementing detection and monitoring tools. For example, prompt analysis, output filtering, usage pattern anomalies, and suspicious access attempts.',
        },
        {
          required: 'core',
          activity:
            'Implementing user feedback when policy is breached. For example, showing alerts or error messages when inputs violate acceptable use.',
        },
        {
          required: 'supplemental',
          activity: 'Real-time monitoring, blocking, or alerting capabilities.',
        },
        {
          required: 'supplemental',
          activity:
            'Maintaining logging and tracking systems. For example, incident creation, violation tracking with case assignment and resolution documentation.',
        },
        {
          required: 'supplemental',
          activity:
            'Conducting regular effectiveness reviews. For example, quarterly analysis of violation trends, tool performance assessment, policy updates based on emerging threats, and user training adjustments.',
        },
      ],
      evidence: [
        {
          id: 'E010.1',
          kind: 'documentation',
          title: 'AI acceptable use policy',
          required: 'core',
          category: 'legal-policies',
          locations: ['Acceptable Use Policy', 'Universal'],
          description:
            'Policy document defining acceptable and/or prohibited AI usage - can be standalone document or parts of, e.g., terms of service',
        },
        {
          id: 'E010.2',
          kind: 'config',
          title: 'AUP violation detection',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            'Code, configuration, or monitoring system detecting acceptable use policy violations - may include prompt analysis logic, output filtering rules, anomaly detection for usage patterns, or alerting on suspicious access attempts.',
        },
        {
          id: 'E010.3',
          kind: 'demonstration',
          title: 'User notification for AUP breaches',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Product', 'Universal'],
          description:
            'User-facing alerts or error messages displayed when acceptable use policy is violated - may include in-product warning messages, blocked request notifications, or error screens explaining policy violations.',
        },
        {
          id: 'E010.4',
          kind: 'documentation',
          title: 'Guardrails enforcing acceptable use',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Engineering Practice', 'Universal'],
          description:
            'Documentation or screenshots showing additional AUP enforcement mechanisms - may include real-time blocking/alerting systems, violation tracking logs with incident management, effectiveness review reports analyzing violation trends and policy updates, or training materials addressing emerging misuse patterns.',
        },
      ],
      crosswalks: {
        'iso-42001': [
          'A.2.2: AI policy',
          'A.9.2: Processes for responsible use of AI systems',
          'A.9.4: Intended use of the AI system',
          'A.2.4: Review of the AI policy',
          'A.9.3: Objectives for responsible use of AI system',
          '4.1: Understanding the organization and its context',
          '4.3: Determining the scope of the AI management system',
          '5.2: AI policy',
        ],
        'nist-ai-rmf': [
          'GOVERN 1.2: Trustworthy AI policies',
          'MAP 1.6: System requirements',
          'MAP 3.3: Application scope',
          'MAP 3.4: Operator proficiency',
          'MEASURE 2.4: Production monitoring',
        ],
        'owasp-top-10': ['LLM10:25 - Unbounded Consumption'],
        'csa-aicm': ['GRC-09: Acceptable Use of the AI Service'],
        'owasp-aivss': ['Agent Orchestration and Multi-Agent Exploitation'],
        'cisco-ai-security-safety-framework': [
          'AITech-13.1: Disruption of Availability',
          'AITech-18.1: Fraudulent Use',
          'AITech-18.2: Malicious Workflows',
        ],
        'soc-2': [
          'CC1.1: Commitment to integrity and ethical values',
          'CC5.3: Deploy controls through policies',
        ],
      },
    },
    {
      id: 'E011',
      title: 'Record processing locations',
      domain: 'E',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/accountability/record-processing-locations',
      cadence_months: 12,
      type: 'preventative',
      summary: 'Document AI data processing locations.',
      keywords: ['Data Processing', 'Storage Location', 'Data Protections'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Maintaining AI infrastructure location documentation. For example, geographic locations of foundation model processing locations and inference endpoint regions, documenting third-party AI service provider data handling locations.',
        },
        {
          required: 'core',
          activity: 'Reviewing and updating documentation regularly.',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing transfer compliance procedures. For example, assessing data transfer requirements for AI training data and inference processing, maintaining approved transfer mechanisms for foundation model providers and AI infrastructure, mitigating transfer risk for cross-border AI model training.',
        },
      ],
      evidence: [
        {
          id: 'E011.1',
          kind: 'documentation',
          title: 'AI processing locations',
          required: 'core',
          category: 'operational-practices',
          locations: ['Trust Center', 'Universal'],
          description:
            'Subprocessor list showing third-party AI provider locations, infrastructure documentation listing cloud regions and inference endpoints, or data flow diagram with geographic processing locations and version history or review dates.',
        },
        {
          id: 'E011.2',
          kind: 'documentation',
          title: 'Data transfer compliance',
          required: 'supplemental',
          category: 'legal-policies',
          locations: [
            'Internal policies',
            'Data Processing Agreement',
            'Universal',
          ],
          description:
            'Demonstrated by DPA, data transfer impact assessments, approved transfer mechanism documentation (Standard Contractual Clauses, adequacy decisions), cross-border data flow approvals for AI training/inference, or risk assessments for international AI processing.',
        },
      ],
      crosswalks: {
        'eu-ai-act': ['Article 11: Technical Documentation'],
        'iso-42001': ['A.7.5: Data provenance'],
        'nist-ai-rmf': ['GOVERN 1.6: AI system inventory'],
        'csa-aicm': [
          'DSP-13: Personal Data Sub-processing',
          'DSP-19: Data Location',
          'UEM-04: Endpoint Inventory',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 35: Training Data - Data acquisition restrictions',
          'IBM 37: Training Data - Data transfer restrictions',
        ],
        'soc-2': ['CC2.1: Use of relevant, quality information'],
      },
    },
    {
      id: 'E012',
      title: 'Document regulatory compliance',
      domain: 'E',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/accountability/document-regulatory-compliance',
      cadence_months: 6,
      type: 'preventative',
      summary:
        'Document applicable AI laws and standards, required data protections, and strategies for compliance.',
      keywords: ['Regulatory', 'EU', 'NY', 'NIST', 'ISO', 'GDPR'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Identifying relevant regulations. For example, data protection laws. For example, GDPR, CCPA, sector-specific requirements, emerging AI standards. For example, EU AI Act.',
        },
        {
          required: 'core',
          activity:
            'Documenting compliance procedures and strategies appropriate for company size and operations.',
        },
        {
          required: 'core',
          activity:
            'Reviewing the repository every 6 months and when additional requirements may be triggered. For example, regulations change or business operations expand into new jurisdictions.',
        },
      ],
      evidence: [
        {
          id: 'E012.1',
          kind: 'documentation',
          title: 'Regulatory compliance reviews',
          required: 'core',
          category: 'legal-policies',
          locations: ['Internal processes', 'Universal'],
          description:
            'Compliance register, assessment memo or review tickets (e.g. in Notion), or policy listing applicable regulations with compliance strategies - should include review dates or version history showing periodic updates.',
        },
      ],
      crosswalks: {
        'eu-ai-act': [
          'Article 16: Obligations of Providers of High-Risk AI Systems',
          'Article 18: Documentation Keeping',
          'Article 21: Cooperation with Competent Authorities',
          'Article 22: Authorised Representatives of Providers of High-Risk AI Systems',
          'Article 25: Responsibilities Along the AI Value Chain',
          'Article 26: Obligations of Deployers of High-Risk AI Systems',
          'Article 43: Conformity Assessment',
          'Article 44: Certificates',
          'Article 47: EU Declaration of Conformity',
          'Article 48: CE Marking',
          'Article 49: Registration',
        ],
        'iso-42001': [
          'A.2.3: Alignment with other organizational policies',
          'A.8.5: Information for interested parties',
          '10.2: Nonconformity and corrective action',
        ],
        'nist-ai-rmf': [
          'GOVERN 1.1: Legal and regulatory compliance',
          'GOVERN 1.7: AI system decommissioning',
          'MAP 1.1: Context understanding',
          'MAP 4.1: Legal risk mapping',
        ],
        'csa-aicm': [
          'A\\&A-04: Requirements Compliance',
          'DSP-10: Sensitive Data Transfer',
          'DSP-18: Disclosure Notification',
          'GRC-07: Information System Regulatory Mapping',
          'HRS-10: Non-Disclosure Agreements',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 16: Agentic AI - AI agent compliance',
          'IBM 32: Training Data - Data privacy rights alignment',
          'IBM 36: Training Data - Data usage restrictions',
          'IBM 89: Non-Technical - Legal accountability',
        ],
        'co-ai-act': [
          '6-1-1706 & 6-1-1707: Enforcement & AG, Rulemaking Authority',
        ],
        'ca-sb-53': ['22757.12: Transparency & Reporting Obligations'],
        'soc-2': [
          'CC3.1: Clear objectives for risk assessment',
          'P6.6: Breach notification obligations',
        ],
      },
    },
    {
      id: 'E013',
      title: 'Implement quality management system',
      domain: 'E',
      application: 'optional',
      retired: false,
      url: 'https://standard.aiuc-1.com/accountability/implement-quality-management-system',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Establish a quality management system for AI systems proportionate to the size of the organization.',
      keywords: ['EU', 'Quality management', 'Regulatory'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Defining quality objectives, metrics, and risk management approach for AI systems. For example, establishing performance targets, safety thresholds, risk assessment methodologies, and measurement processes appropriate to system risk level.',
        },
        {
          required: 'core',
          activity:
            'Establishing change management, approval processes, and documentation standards. For example, defining review and approval requirements for AI system changes, assigning accountability for quality decisions, documenting design and development procedures.',
        },
        {
          required: 'core',
          activity:
            'Implementing defect tracking, continuous improvement, and post-market monitoring. For example, maintaining issue tracking systems, conducting root cause analysis, documenting corrective actions, establishing post-market monitoring processes.',
        },
        {
          required: 'supplemental',
          activity:
            'Establishing data management and record-keeping systems. For example, documenting data governance procedures, maintaining technical documentation, implementing record retention policies for model training data and system outputs.',
        },
        {
          required: 'supplemental',
          activity:
            'Documenting communication procedures with regulatory authorities and stakeholders. For example, establishing protocols for regulatory reporting, stakeholder notifications for incidents, and procedures for authority interactions.',
        },
      ],
      evidence: [
        {
          id: 'E013.1',
          kind: 'documentation',
          title: 'Quality objectives and risk management',
          required: 'core',
          category: 'operational-practices',
          locations: ['Internal policies', 'Universal'],
          description:
            'Documentation showing quality objectives, metrics, and risk management approach - may include quality metrics dashboard or reports, risk assessment documentation for AI systems, performance targets and safety thresholds, or measurement methodologies defining how quality is evaluated.',
        },
        {
          id: 'E013.2',
          kind: 'documentation',
          title: 'Change management procedures',
          required: 'core',
          category: 'operational-practices',
          locations: ['Internal policies', 'Universal'],
          description:
            'Documentation showing change management and approval processes - may include change approval workflows or procedures, RACI matrix assigning accountability for quality decisions, design and development procedure documents, or documentation standards and templates for AI systems. May be fulfilled by evidence submitted to E004: Assign accountability.',
        },
        {
          id: 'E013.3',
          kind: 'config',
          title: 'Issue tracking and monitoring',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Tooling', 'Universal'],
          description:
            'Issue tracking system or monitoring records - may include issue tracker (Jira, Linear, GitHub) with defects and corrective actions, root cause analysis reports, post-market monitoring logs or dashboards, or continuous improvement documentation showing lessons learned.',
        },
        {
          id: 'E013.4',
          kind: 'documentation',
          title: 'Data management procedures',
          required: 'supplemental',
          category: 'operational-practices',
          locations: ['Internal policies', 'Universal'],
          description:
            'Documentation showing data management and record-keeping practices - may include data governance policies, technical documentation standards, record retention procedures, or data lineage tracking systems for training data and system outputs.',
        },
        {
          id: 'E013.5',
          kind: 'documentation',
          title: 'Stakeholder communication procedures',
          required: 'supplemental',
          category: 'operational-practices',
          locations: ['Internal processes', 'Universal'],
          description:
            'Procedures document or communication protocols - may include incident reporting templates or protocols to regulatory authorities, stakeholder notification procedures for serious incidents, guidelines for interacting with competent authorities or notified bodies, or escalation procedures for regulatory communications.',
        },
      ],
      crosswalks: {
        'eu-ai-act': [
          'Article 9: Risk Management System',
          'Article 10: Data and Data Governance',
          'Article 11: Technical Documentation',
          'Article 12: Record-Keeping',
          'Article 16: Obligations of Providers of High-Risk AI Systems',
          'Article 17: Quality Management System',
          'Article 18: Documentation Keeping',
          'Article 19: Automatically Generated Logs',
          'Article 26: Obligations of Deployers of High-Risk AI Systems',
          'Article 43: Conformity Assessment',
          'Article 72: Post-Market Monitoring by Providers and Post-Market Monitoring Plan for High-Risk AI Systems',
          'Article 73: Reporting of Serious Incidents',
        ],
        'nist-ai-rmf': [
          'GOVERN 1.4: Risk management governance',
          'GOVERN 1.3: Risk management processes',
        ],
        'iso-42001': [
          'A.5.2: AI system impact assessment process',
          'A.6.2.7: AI system technical documentation',
          'A.5.3: Documentation of AI system impact assessments',
          'A.5.4: Assessing AI system impact on individuals or groups of individuals',
          'A.4.2: Resource documentation',
          '4.4: AI management system',
          '6.1.4: AI system impact assessment',
          '7.1: Resources',
          '7.5.1: Documented information — General',
          '8.1: Operational planning and control',
          '8.4: AI system impact assessment',
          'A.6.2.3: Documentation of AI system design and development',
          '9.1: Monitoring, measurement, analysis and evaluation',
          '10.1: Continual improvement',
          '10.2: Nonconformity and corrective action',
        ],
        'csa-aicm': [
          'AIS-01: Application and Interface Security Policy and Procedures',
          'AIS-03: Application Security Metrics',
          'BCR-02: Risk Assessment and Impact Analysis',
          'DSP-09: Data Protection Impact Assessment',
          'GRC-02: Risk Management Program',
          'GRC-10: AI Impact Assessment',
          'MDS-02: Model Artifact Scanning',
          'A\\&A-05: Audit Management Process',
          'I\\&S-02: Capacity and Resource Planning',
          'CCC-02: Quality Testing',
          'TVM-01: Threat and Vulnerability Management Policy and Procedures',
          'TVM-02: Malware and Malicious Instructions Protection Policy and Procedure',
          'SEF-01: Security Incident Management Policy and Procedures',
        ],
        'owasp-aivss': ['Agent Supply Chain and Dependency Risk'],
        'ibm-ai-risk-atlas': [
          'IBM 12: Agentic AI - Mitigation and maintenance',
          'IBM 85: Non-Technical - Incorrect risk testing',
        ],
        'co-ai-act': ['6-1-1703: Deployer Duties'],
        'ca-sb-53': ['22757.12: Transparency & Reporting Obligations'],
        'soc-2': [
          'CC1.3: Structures, authorities, and responsibilities',
          'CC4.1: Ongoing and separate evaluations',
          'CC5.3: Deploy controls through policies',
        ],
      },
    },
    {
      id: 'E014',
      title: 'Share transparency reports',
      domain: 'E',
      application: 'optional',
      retired: true,
      url: 'https://standard.aiuc-1.com/accountability/share-transparency-reports',
      retired_in: '2026.4',
      summary: 'Merged with E017 - see changelog (Q1 2026 update).',
      keywords: ['Transparency'],
      activities: [
        {
          required: 'supplemental',
          activity:
            'This requirement was merged into E017 at the Q1, 2026 standard update. See [aiuc-1.com/changelog](http://aiuc-1.com/changelog) for more information',
        },
      ],
      evidence: [
        {
          id: 'E014.1',
          kind: 'retired',
          title: 'Retired',
          required: 'supplemental',
          description: 'Retired',
        },
      ],
      crosswalks: {
        'eu-ai-act': ['Article 11: Technical Documentation'],
        'iso-42001': [
          'A.6.2.7: AI system technical documentation',
          'A.8.2: System documentation and information for users',
          'A.8.5: Information for interested parties',
          '7.4: Communication',
        ],
        'nist-ai-rmf': [
          'MANAGE 4.2: Continual improvement',
          'MANAGE 4.3: Incident communication',
          'MAP 1.6: System requirements',
          'MAP 5.2: Stakeholder engagement',
          'MEASURE 2.8: Transparency and accountability',
          'MEASURE 2.9: Model explanation',
          'MEASURE 4.2: Trustworthiness validation',
        ],
        'csa-aicm': [
          'GRC-14: Explainability Evaluation',
          'TVM-09: Vulnerability Management Reporting',
          'TVM-10: Vulnerability Management Metrics',
          'A\\&A-06: Remediation',
          'LOG-13: Failures and Anomalies Reporting',
          'LOG-10: Encryption Monitoring and Reporting',
          'SEF-05: Incident Response Metrics',
          'SEF-07: Security Breach Notification',
        ],
      },
    },
    {
      id: 'E015',
      title: 'Log AI system activity',
      domain: 'E',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/accountability/log-model-activity',
      cadence_months: 12,
      type: 'detective',
      summary:
        'Maintain logs of AI system processes, actions, and agent outputs where permitted to support incident investigation, auditing, and explanation of AI system behavior.',
      keywords: ['Explainability', 'Logs'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Capturing system activity details to support incident investigation and behavior explanation. For example, logging inputs, processing steps, outputs, and metadata for AI systems.',
        },
        {
          required: 'core',
          activity:
            'Implementing log storage with appropriate retention periods, access controls, and data sanitation to support auditing and incident response.',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing technical controls to ensure logs are tamper-evident and independently verifiable. For example, ensuring that captured records cannot be modified or deleted after creation, ensuring sequence integrity so that gaps, omissions, and reordering are detectable during incident investigation or audit.',
        },
        {
          required: 'supplemental',
          activity:
            'Capturing full execution chains of agentic workflows to support investigation of agent-specific incidents. For example, logging agent provenance metadata, tool call parameters and results, sub-agent delegations and their outcomes, approval/authorization events (e.g., human-in-the-loop approvals), and reasoning traces where available.',
        },
      ],
      evidence: [
        {
          id: 'E015.1',
          kind: 'config',
          title: 'Logging implementation',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Logs', 'Universal'],
          description:
            'Logging code or configuration showing what system activity is captured - may include code logging inputs and outputs, logging configuration file specifying what to log, or example log entries showing captured information (timestamps, inputs, outputs, user actions).',
        },
        {
          id: 'E015.3',
          kind: 'config',
          title: 'Log storage',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Logs', 'Engineering Tooling', 'Universal'],
          description:
            'Log storage system showing retention policies, access controls and sanitation practices - may include log management platform (Datadog, Splunk, CloudWatch) with retention period settings and PII-masking, access control configuration showing who can view logs, or storage settings with automatic deletion rules.',
        },
        {
          id: 'E015.4',
          kind: 'config',
          title: 'Log integrity protection',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Logs', 'Engineering Code', 'Universal'],
          description:
            'Log immutability controls - for example, write-once-read-many (WORM) storage configuration, cryptographic hashing of log entries, append-only database settings, or third-party log management platform features.',
        },
        {
          id: 'E015.2',
          kind: 'config',
          title: 'AI agent logging implementation',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: ['Logs', 'Universal'],
          description:
            'Logging code or configuration demonstrating agent execution logging - may include log fields capturing agent provenance metadata per execution (e.g. agent type identifier, creator or deployment origin); structured log entries capturing tool call parameters and their results; delegation chain records showing sub-agent handoffs with identity, task context, and outcome at each step; approval/authorization records linked to execution (e.g., approver identity, timestamp, decision outcome); or reasoning trace output from the agent framework.',
        },
      ],
      crosswalks: {
        'mitre-atlas': ['AML-M0024: AI Telemetry Logging'],
        'eu-ai-act': [
          'Article 12: Record-Keeping',
          'Article 19: Automatically Generated Logs',
        ],
        'iso-42001': ['A.6.2.8: AI system recording of event logs'],
        'nist-ai-rmf': [
          'MEASURE 2.4: Production monitoring',
          'MEASURE 2.8: Transparency and accountability',
        ],
        'owasp-top-10': ['LLM10:25 - Unbounded Consumption'],
        'csa-aicm': [
          'LOG-01: Logging and Monitoring Policy and Procedures',
          'LOG-03: Security Monitoring and Alerting',
          'LOG-07: Logging Scope',
          'LOG-08: Log Records',
          'LOG-09: Log Protection',
          'LOG-10: Encryption Monitoring and Reporting',
          'LOG-11: Transaction / Activity Logging',
          'LOG-13: Failures and Anomalies Reporting',
          'LOG-14: Input Monitoring',
          'LOG-15: Output Monitoring',
          'MDS-10: Model Continuous Monitoring',
          'LOG-04: Audit Logs Access and Accountability',
          'LOG-05: Audit Logs Monitoring and Response',
          'LOG-06: Clock Synchronization',
          'LOG-12: Access Control Logs',
          'SEF-05: Incident Response Metrics',
          'SEF-07: Security Breach Notification',
        ],
        'owasp-aivss': ['Agent Untraceability'],
        'ibm-ai-risk-atlas': [
          'IBM 1: Agentic AI - Unexplainable and untraceable actions',
          'IBM 13: Agentic AI - Lack of AI agent transparency',
          'IBM 14: Agentic AI - Reproducibility',
          'IBM 15: Agentic AI - Accountability of AI agent actions',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-11.2: Model-Selective Evasion',
          'AITech-16.1: Eavesdropping',
          'AITech-18.2: Malicious Workflows',
        ],
        'owasp-agentic-top-10': [
          'ASI06 - Memory and Context Poisoning',
          'ASI07 - Insecure Inter-Agent Communication',
          'ASI08 - Cascading Failures',
          'ASI10 - Rogue Agents',
        ],
        'soc-2': [
          'CC2.1: Use of relevant, quality information',
          'P4.2: Retention of personal information',
          'PI1.5: Storage completeness and accuracy',
        ],
      },
    },
    {
      id: 'E016',
      title: 'Implement AI disclosure mechanisms',
      domain: 'E',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/accountability/implement-ai-disclosure-mechanisms',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement clear disclosure mechanisms to inform users when they are interacting with AI systems rather than humans.',
      keywords: ['Labelling', 'Transparency'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Implementing AI disclosure for text-based interactions. For example, displaying clear notices when users interact with AI chatbots, virtual assistants, or automated messaging systems.',
        },
        {
          required: 'core',
          activity:
            'Implementing AI disclosure for voice-based interactions. For example, providing audio notifications at the beginning of voice calls or interactions.',
        },
        {
          required: 'core',
          activity:
            'Labelling AI-generated media and documents in a machine-readable and detectable format. For example, marking AI-generated images, videos, audio, or documents with metadata, watermarks, or labels indicating artificial generation.',
        },
        {
          required: 'core',
          activity:
            'Disclosing when autonomous AI agents or systems are performing actions. For example, notifying users when AI systems are making decisions, processing requests, or executing tasks without human oversight.',
        },
        {
          required: 'core',
          activity:
            'Establishing reactive disclosure capabilities when users ask if they are interacting with AI.',
        },
      ],
      evidence: [
        {
          id: 'E016.1',
          kind: 'demonstration',
          title: 'AI disclosure',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Product', 'Universal'],
          description:
            'AI disclosures across applicable modalities. May include disclosures for text (“You’re chatting with AI” notice in chat or on automated email/SMS), voice (recording or transcript of a spoken disclosure), automated actions (“Powered by AI” labels or “Completed by AI agent” notifications), AI-generated content (C2PA metadata or watermarks), and responses to “Are you AI?” (chatbot or voice agent transcript).',
        },
      ],
      crosswalks: {
        'eu-ai-act': [
          'Article 13: Transparency and Provision of Information to Deployers',
          'Article 50: Transparency Obligations for Providers and Deployers of Certain AI Systems',
        ],
        'iso-42001': ['A.8.2: System documentation and information for users'],
        'nist-ai-rmf': [
          'MAP 2.2: Knowledge limits',
          'MAP 3.4: Operator proficiency',
          'MEASURE 2.8: Transparency and accountability',
        ],
        'csa-aicm': ['GRC-15: Human supervision'],
        'owasp-aivss': ['Agent Identity Impersonation'],
        'ibm-ai-risk-atlas': ['IBM 70: Output - Non-disclosure'],
        'nyc-ll-144': ['5-304: Provide Notice'],
        'co-ai-act': ['6-1-1703: Deployer Duties'],
        'owasp-agentic-top-10': ['ASI09 - Human-Agent Trust Exploitation'],
        'soc-2': [
          'CC2.2: Internal communication of controls',
          'CC2.3: External communication of controls',
        ],
      },
    },
    {
      id: 'E017',
      title: 'Document system transparency policy',
      domain: 'E',
      application: 'optional',
      retired: false,
      url: 'https://standard.aiuc-1.com/accountability/document-system-transparency-policy',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Establish a system transparency policy and maintain a repository of model cards, datasheets, and interpretability reports for major systems.',
      keywords: ['Transparency', 'System Cards'],
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Creating transparency documentation for major AI systems. For example, documenting system characteristics, data provenance, and model behavior for systems meeting documentation criteria.',
        },
        {
          required: 'supplemental',
          activity:
            'Defining policies for sharing transparency documentation with external stakeholders. For example, establishing when reports are shared, specifying recipient categories, determining what information is disclosed to each stakeholder type.',
        },
        {
          required: 'supplemental',
          activity:
            'Documenting sharing procedures including approval workflows, version control, and distribution tracking. For example, establishing approval requirements before external sharing, maintaining version control of shared documents, tracking which stakeholders received which versions.',
        },
        {
          required: 'supplemental',
          activity:
            'Documenting platform-level and deployer-level security responsibilities for AI systems. For example, delineating which security obligations are managed by the platform versus the deploying organization.',
        },
      ],
      evidence: [
        {
          id: 'E017.1',
          kind: 'documentation',
          title: 'AI system transparency documentation',
          required: 'core',
          category: 'technical-implementation',
          locations: ['Engineering Code', 'Universal'],
          description:
            'Transparency documentation artifacts such as a model card, datasheet, or AI bill of materials - for example, records of the system name and version, training or fine-tuning data sources and characteristics, dated records of fine-tuning or adaptation changes and records of AI-specific components beyond the model including frameworks, orchestration layers, tool connectors.',
        },
        {
          id: 'E017.2',
          kind: 'documentation',
          title: 'Transparency report sharing policy',
          required: 'supplemental',
          category: 'operational-practices',
          locations: ['Internal processes', 'Internal policies', 'Universal'],
          description:
            'Policy document defining transparency sharing practices - may include sharing triggers, recipient categories with disclosure levels (regulators, customers, affected parties, public), or matrix mapping stakeholder types to shared documentation (model cards, datasheets, performance reports, incident summaries).',
        },
        {
          id: 'E017.3',
          kind: 'documentation',
          title: 'Platform and deployer security responsibilities',
          required: 'supplemental',
          category: 'legal-policies',
          locations: ['Terms of Service', 'Internal policies', 'Universal'],
          description:
            'Documentation delineating platform and deployer security responsibilities - may include shared responsibility documentation defining platform-level and deployer-level security obligations.',
        },
      ],
      crosswalks: {
        'mitre-atlas': [
          'AML-M0023: AI Bill of Materials',
          'AML-M0025: Maintain AI Dataset Provenance',
        ],
        'eu-ai-act': ['Article 11: Technical Documentation'],
        'iso-42001': [
          'A.4.2: Resource documentation',
          'A.4.3: Data resources',
          'A.4.4: Tooling resources',
          'A.4.5: System and computing resources',
          'A.6.2.3: Documentation of AI system design and development',
          'A.2.2: AI policy',
          'A.2.4: Review of the AI policy',
          '4.3: Determining the scope of the AI management system',
          '5.2: AI policy',
        ],
        'nist-ai-rmf': [
          'GOVERN 1.2: Trustworthy AI policies',
          'GOVERN 1.6: AI system inventory',
          'MAP 1.6: System requirements',
          'MEASURE 2.8: Transparency and accountability',
          'MEASURE 2.9: Model explanation',
          'MEASURE 4.3: Performance tracking',
        ],
        'csa-aicm': [
          'GRC-13: Explainability Requirement',
          'GRC-14: Explainability Evaluation',
          'MDS-03: Model Documentation',
          'MDS-04: Model Documentation Requirements',
          'MDS-05: Model Documentation Validation',
          'STA-16: Service Bill of Material (BOM)',
          'DSP-20: Data Provenance and Transparency',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 13: Agentic AI - Lack of AI agent transparency',
          'IBM 79: Non-Technical - Lack of data transparency',
          'IBM 80: Non-Technical - Lack of model transparency',
          'IBM 81: Non-Technical - Lack of system transparency',
        ],
        'nyc-ll-144': ['5-303: Publish Audit Results'],
        'co-ai-act': [
          '6-1-1702: Developer Duties',
          '6-1-1703: Deployer Duties',
        ],
        'ca-sb-53': ['22757.12: Transparency & Reporting Obligations'],
        'soc-2': [
          'CC2.3: External communication of controls',
          'CC6.1: Logical access security',
        ],
      },
    },
    {
      id: 'E018',
      title: 'Third-party testing for accountability risk',
      domain: 'E',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/accountability/3rd-party-testing-for-accountability-risk',
      cadence_months: 3,
      summary:
        'Appoint expert third-parties to evaluate system robustness to accountability risk as defined in the AIUC-1 risk taxonomy at least every 3 months',
      capabilities: ['Universal'],
      activities: [
        {
          required: 'core',
          activity:
            'Appointing qualified third-party assessors. Including selecting assessors with relevant technical capabilities for identified risk areas, maintaining records of assessor qualifications and independence.',
        },
        {
          required: 'core',
          activity:
            'Conducting regular testing. Including defining testing scope and methodologies based on risk taxonomy and performing assessments of high-risk areas at least every quarter.',
        },
        {
          required: 'core',
          activity:
            'Maintaining documentation. Including testing scope and results.',
        },
      ],
      evidence: [
        {
          id: 'E018.1',
          kind: 'evals',
          title: 'Third-party evaluation report assessing accountability risk',
          required: 'core',
          category: 'third-party-evals',
          locations: ['Third-party evaluation report', 'Universal'],
          description:
            'Third-party evaluation report showing testing for agent accountability risk - including risks tested (e.g., bypassing AI disclosure), testing methodology and findings',
        },
      ],
      crosswalks: {},
    },
    {
      id: 'F001',
      title: 'Prevent AI cyber misuse',
      domain: 'F',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/society/prevent-ai-cyber-misuse',
      cadence_months: 12,
      type: 'preventative',
      summary:
        'Implement or document guardrails to prevent AI-enabled misuse for cyber attacks and exploitation.',
      keywords: ['Cyber Attacks'],
      capabilities: [
        'Text-generation',
        'Automation',
        'Voice-generation',
        'Code-generation',
      ],
      activities: [
        {
          required: 'core',
          activity:
            'Results of testing from foundation model developer on offensive cyber capabilities and mitigations.',
        },
        {
          required: 'supplemental',
          activity:
            'Implementing malicious use detection and blocking. For example, deploying available content filtering to detect requests for malicious code generation, attack planning, and vulnerability exploitation guidance, configuring automated blocking of cyber attack assistance requests, maintaining databases of prohibited use patterns.',
        },
        {
          required: 'supplemental',
          activity:
            'Assessing and mitigating cyber capabilities for open-weight models. For example, re-running cyber misuse evals on the modified model or adding output classifiers for exploit and malware generation.',
        },
      ],
      evidence: [
        {
          id: 'F001.1',
          kind: 'documentation',
          title: 'Foundation model cyber capabilities',
          required: 'core',
          category: 'legal-policies',
          locations: [
            'Vendor Contracts',
            'Text-generation',
            'Automation',
            'Voice-generation',
            'Code-generation',
          ],
          description:
            'Provider model cards, cybersecurity assessment reports from model developers, or foundation model documentation describing offensive cyber capabilities and mitigations',
        },
        {
          id: 'F001.2',
          kind: 'config',
          title: 'Cyber use detection',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: [
            'Engineering Code',
            'Text-generation',
            'Automation',
            'Voice-generation',
            'Code-generation',
          ],
          description:
            'Content filtering rules blocking cyber attack requests, keyword or pattern matching detecting malicious code generation attempts, automated blocking configuration for exploit development queries, or prohibited use pattern database.',
        },
        {
          id: 'F001.3',
          kind: 'documentation',
          title: 'Cyber capability assessment for modified models',
          required: 'supplemental',
          category: 'operational-practices',
          locations: [
            'Internal processes',
            'Text-generation',
            'Automation',
            'Voice-generation',
            'Code-generation',
          ],
          description:
            "Assessment showing base model and version, modifications made, whether the developer's results still hold, and compensating guardrails applied - may include a short memo, re-run eval results or guardrail configuration.",
        },
      ],
      crosswalks: {
        'nist-ai-rmf': ['MEASURE 2.7: Security and resilience'],
        'iso-42001': ['A.5.5: Assessing societal impacts of AI systems'],
        'csa-aicm': [
          'GRC-02: Risk Management Program',
          'GRC-09: Acceptable Use of the AI Service',
          'GRC-10: AI Impact Assessment',
          'GRC-12: Ethics Committee',
          'TVM-11: Guardrails',
        ],
        'owasp-aivss': ['Agent Identity Impersonation'],
        'ibm-ai-risk-atlas': [
          'IBM 53: Inference - Social hacking attack',
          'IBM 61: Output - Harmful code generation',
          'IBM 65: Output - Dangerous use',
          'IBM 66: Output - Spreading disinformation',
          'IBM 67: Output - Nonconsensual use',
        ],
        'cisco-ai-security-safety-framework': [
          'AITech-17.1: Sensor Spoofing',
          'AITech-18.1: Fraudulent Use',
          'AITech-18.2: Malicious Workflows',
        ],
        'ca-sb-53': ['22757.12: Transparency & Reporting Obligations'],
        'soc-2': ['CC7.3: Security event evaluation'],
      },
    },
    {
      id: 'F002',
      title: 'Prevent catastrophic misuse',
      domain: 'F',
      application: 'mandatory',
      retired: false,
      url: 'https://standard.aiuc-1.com/society/prevent-catastrophic-misuse',
      cadence_months: 12,
      type: 'detective',
      summary:
        'Implement or document guardrails to prevent AI-enabled catastrophic system misuse (chemical / bio / radio / nuclear).',
      keywords: ['CBRN', 'Chemical', 'Bioweapon', 'Radioactive', 'Nuclear'],
      capabilities: ['Text-generation', 'Voice-generation', 'Image-generation'],
      activities: [
        {
          required: 'core',
          activity:
            'Results of testing from foundation model developer on CBRN capabilities and mitigations.',
        },
        {
          required: 'supplemental',
          activity:
            'Establishing catastrophic misuse monitoring. For example, monitoring AI system interactions for patterns indicating weapons development or mass harm intent, implementing real-time alerting for detected catastrophic misuse attempts, documenting suspicious queries and system responses.',
        },
      ],
      evidence: [
        {
          id: 'F002.1',
          kind: 'documentation',
          title: 'Foundation model CBRN capabilities',
          required: 'core',
          category: 'legal-policies',
          locations: [
            'Vendor Contracts',
            'Text-generation',
            'Voice-generation',
            'Image-generation',
          ],
          description:
            'List of foundation models used with CBRN capability information - may include provider model cards with CBRN assessments, weapons of mass destruction risk evaluations from model developers, or other documentation describing CBRN-related capabilities and mitigations.',
        },
        {
          id: 'F002.2',
          kind: 'config',
          title: 'Catastrophic misuse monitoring',
          required: 'supplemental',
          category: 'technical-implementation',
          locations: [
            'Engineering Code',
            'Text-generation',
            'Voice-generation',
            'Image-generation',
          ],
          description:
            'Monitoring dashboard or alert configuration for catastrophic misuse patterns - may include usage monitoring flagging CBRN-related queries, alert rules for weapons development patterns, logs of detected and blocked catastrophic misuse attempts, or incident records documenting suspicious CBRN-related interactions.',
        },
      ],
      crosswalks: {
        'iso-42001': ['A.5.5: Assessing societal impacts of AI systems'],
        'csa-aicm': [
          'GRC-02: Risk Management Program',
          'GRC-09: Acceptable Use of the AI Service',
          'GRC-10: AI Impact Assessment',
          'GRC-12: Ethics Committee',
          'TVM-11: Guardrails',
        ],
        'ibm-ai-risk-atlas': [
          'IBM 60: Output - Harmful output',
          'IBM 65: Output - Dangerous use',
        ],
        'cisco-ai-security-safety-framework': ['AITech-15.1: Harmful Content'],
      },
    },
  ] as StandardControl[],
};

export const ISO_42001_STANDARD: StandardSpec = {
  id: 'iso-42001',
  version: '2023',
  name: 'ISO/IEC 42001:2023',
  description:
    "The international standard for an AI management system: clauses 4 to 10 of the management system and the Annex A controls. Read here through AIUC-1's crosswalk: each clause names the AIUC-1 controls that cover it and how far; what no AIUC-1 control covers is the organization's.",
  enabled: true,
  tags: ['standard', 'iso-42001', 'management-system'],
  publishedBy: 'ISO/IEC',
  url: 'https://www.iso.org/standard/42001',
  releasedOn: '2023-12-18',
  nextReleaseOn: null,
  readOn: '2026-10-15',
  certificateValidMonths: 36,
  mapsTo: 'aiuc-1',
  evidenceKinds: {
    documentation:
      'Policies, contracts, plans and procedures a person wrote and signed.',
    config: 'Code and settings that implement a control, as they run.',
    logs: 'Audit trails and monitoring: what the system recorded as it ran.',
    evals: "A third party's evaluation report, on the standard's cadence.",
    report: 'A report the organization publishes or records.',
    demonstration:
      'A screen, a notice, a walkthrough: the control seen working.',
  },
  frameworks: {
    'aiuc-1': 'AIUC-1',
  },
  domains: [
    {
      id: '4',
      name: 'Context of the organization',
    },
    {
      id: '5',
      name: 'Leadership',
    },
    {
      id: '6',
      name: 'Planning',
    },
    {
      id: '7',
      name: 'Support',
    },
    {
      id: '8',
      name: 'Operation',
    },
    {
      id: '9',
      name: 'Performance evaluation',
    },
    {
      id: '10',
      name: 'Improvement',
    },
    {
      id: 'A',
      name: 'Annex A controls',
    },
  ],
  controls: [
    {
      id: '4.1',
      title: 'Understanding the organization and its context',
      domain: '4',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall determine external and internal issues relevant to the AI management system’s purpose and ability to achieve intended results.',
      evidence: [
        {
          id: '4.1.1',
          kind: 'documentation',
          title:
            "Understanding the organization and its context: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['C001', 'E010'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 is focused on defining acceptable use and assessing risk of the AI system',
      crosswalks: {
        'aiuc-1': ['C001', 'E010'],
      },
    },
    {
      id: '4.2',
      title: 'Understanding the needs and expectations of interested parties',
      domain: '4',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall determine interested parties and their relevant requirements to the AI management system.',
      evidence: [
        {
          id: '4.2.1',
          kind: 'documentation',
          title:
            "Understanding the needs and expectations of interested parties: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: [],
      coverage: 'none',
      coverage_note: 'Outside the scope of AIUC-1',
      crosswalks: {
        'aiuc-1': [],
      },
    },
    {
      id: '4.3',
      title: 'Determining the scope of the AI management system',
      domain: '4',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall define and document the scope of the AI management system, including applicability and boundaries.',
      evidence: [
        {
          id: '4.3.1',
          kind: 'documentation',
          title:
            "Determining the scope of the AI management system: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E017', 'E010'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E017', 'E010'],
      },
    },
    {
      id: '4.4',
      title: 'AI management system',
      domain: '4',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall establish, implement, maintain, and continually improve the AI management system.',
      evidence: [
        {
          id: '4.4.1',
          kind: 'documentation',
          title: "AI management system: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E013'],
      coverage: 'full',
      coverage_note:
        'Met by organizations that opt-in to the optional quality management system requirement',
      crosswalks: {
        'aiuc-1': ['E013'],
      },
    },
    {
      id: '5.1',
      title: 'Leadership and commitment',
      domain: '5',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'Top management shall demonstrate leadership and commitment to the AI management system and its effectiveness.',
      evidence: [
        {
          id: '5.1.1',
          kind: 'documentation',
          title:
            "Leadership and commitment: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E004'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E004'],
      },
    },
    {
      id: '5.2',
      title: 'AI policy',
      domain: '5',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'Top management shall establish an AI policy appropriate to the organization and supportive of AI objectives.',
      evidence: [
        {
          id: '5.2.1',
          kind: 'documentation',
          title: "AI policy: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E010', 'E017'],
      coverage: 'full',
      coverage_note:
        'AI Acceptable Use Policy and Transparency Policy collectively fulfil the ISO control. Organizations may develop a standalone AI policy',
      crosswalks: {
        'aiuc-1': ['E010', 'E017'],
      },
    },
    {
      id: '5.3',
      title: 'Roles, responsibilities and authorities',
      domain: '5',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'Top management shall assign roles, responsibilities, and authorities for the AI management system.',
      evidence: [
        {
          id: '5.3.1',
          kind: 'documentation',
          title:
            "Roles, responsibilities and authorities: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E004'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E004'],
      },
    },
    {
      id: '6.1.1',
      title: 'Actions to address risks and opportunities — General',
      domain: '6',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall plan actions to address risks and opportunities, integrate them into processes, and evaluate their effectiveness.',
      evidence: [
        {
          id: '6.1.1.1',
          kind: 'documentation',
          title:
            "Actions to address risks and opportunities — General: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['C001', 'C008'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['C001', 'C008'],
      },
    },
    {
      id: '6.1.2',
      title: 'AI risk assessment',
      domain: '6',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall establish and maintain a process for AI risk assessment, including identification, analysis, and evaluation of risks.',
      evidence: [
        {
          id: '6.1.2.1',
          kind: 'documentation',
          title: "AI risk assessment: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['C001', 'C008'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['C001', 'C008'],
      },
    },
    {
      id: '6.1.3',
      title: 'AI risk treatment',
      domain: '6',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall establish and maintain a process for AI risk treatment, including selecting and implementing necessary controls.',
      evidence: [
        {
          id: '6.1.3.1',
          kind: 'documentation',
          title: "AI risk treatment: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['C001', 'C008'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['C001', 'C008'],
      },
    },
    {
      id: '6.1.4',
      title: 'AI system impact assessment',
      domain: '6',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall conduct AI system impact assessments covering potential effects on individuals, groups, and society.',
      evidence: [
        {
          id: '6.1.4.1',
          kind: 'documentation',
          title:
            "AI system impact assessment: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E013', 'C001'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 requires risk assessment and organizations can opt-in to the optional quality management system requirement, but does not require impact assessment specifically',
      crosswalks: {
        'aiuc-1': ['E013', 'C001'],
      },
    },
    {
      id: '6.2',
      title: 'AI objectives and planning to achieve them',
      domain: '6',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall establish AI objectives at relevant functions and levels, consistent with the AI policy, and maintain plans to achieve them.',
      evidence: [
        {
          id: '6.2.1',
          kind: 'documentation',
          title:
            "AI objectives and planning to achieve them: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: [],
      coverage: 'none',
      coverage_note:
        'Requiring high-level AI objectives is outside the scope of AIUC-1',
      crosswalks: {
        'aiuc-1': [],
      },
    },
    {
      id: '6.3',
      title: 'Planning of changes',
      domain: '6',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall plan and control changes to the AI management system in a planned manner.',
      evidence: [
        {
          id: '6.3.1',
          kind: 'documentation',
          title: "Planning of changes: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E007', 'E008'],
      coverage: 'full',
      coverage_note:
        'AIUC-1 requires that both system changes and process changes are reviewed',
      crosswalks: {
        'aiuc-1': ['E007', 'E008'],
      },
    },
    {
      id: '7.1',
      title: 'Resources',
      domain: '7',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall determine and provide necessary resources for the AI management system.',
      evidence: [
        {
          id: '7.1.1',
          kind: 'documentation',
          title: "Resources: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E013'],
      coverage: 'partial',
      coverage_note:
        'Organizations opting-in to the optional quality management system requirement will be required to documenting resource management, including security-of-supply related measures',
      crosswalks: {
        'aiuc-1': ['E013'],
      },
    },
    {
      id: '7.2',
      title: 'Competence',
      domain: '7',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall ensure competence of persons working under its control based on education, training, or experience.',
      evidence: [
        {
          id: '7.2.1',
          kind: 'documentation',
          title: "Competence: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E004'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 requires that accountability is clearly assigned, but does not require competence assessment specifically',
      crosswalks: {
        'aiuc-1': ['E004'],
      },
    },
    {
      id: '7.3',
      title: 'Awareness',
      domain: '7',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'Persons under the organization’s control shall be aware of the AI policy, objectives, and their contribution to the AI management system.',
      evidence: [
        {
          id: '7.3.1',
          kind: 'documentation',
          title: "Awareness: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: [],
      coverage: 'none',
      coverage_note:
        'Internal training processes are outside the scope of AIUC-1',
      crosswalks: {
        'aiuc-1': [],
      },
    },
    {
      id: '7.4',
      title: 'Communication',
      domain: '7',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall determine internal and external communications relevant to the AI management system.',
      evidence: [
        {
          id: '7.4.1',
          kind: 'documentation',
          title: "Communication: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E014'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 does not specify internal communication requirements',
      crosswalks: {
        'aiuc-1': ['E014'],
      },
    },
    {
      id: '7.5.1',
      title: 'Documented information — General',
      domain: '7',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall document information required by the AI management system and by ISO42001.',
      evidence: [
        {
          id: '7.5.1.1',
          kind: 'documentation',
          title:
            "Documented information — General: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E013'],
      coverage: 'full',
      coverage_note:
        'Organizations opting-in to the optional quality management system requirement will meet this control',
      crosswalks: {
        'aiuc-1': ['E013'],
      },
    },
    {
      id: '7.5.2',
      title: 'Creating and updating documented information',
      domain: '7',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall ensure documented information is properly created, updated, and controlled for suitability and adequacy.',
      evidence: [
        {
          id: '7.5.2.1',
          kind: 'documentation',
          title:
            "Creating and updating documented information: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E008'],
      coverage: 'full',
      coverage_note:
        'The combination of quarterly internal reviews and annual recertification requirements fulfils this control',
      crosswalks: {
        'aiuc-1': ['E008'],
      },
    },
    {
      id: '7.5.3',
      title: 'Control of documented information',
      domain: '7',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall control documented information required by the AI management system and ISO42001.',
      evidence: [
        {
          id: '7.5.3.1',
          kind: 'documentation',
          title:
            "Control of documented information: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: [],
      coverage: 'full',
      coverage_note: 'Required as part of AIUC-1 certification process',
      crosswalks: {
        'aiuc-1': [],
      },
    },
    {
      id: '8.1',
      title: 'Operational planning and control',
      domain: '8',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall plan, implement, and control processes needed for the AI management system, ensuring outputs meet requirements.',
      evidence: [
        {
          id: '8.1.1',
          kind: 'documentation',
          title:
            "Operational planning and control: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E013'],
      coverage: 'full',
      coverage_note:
        'Organizations opting-in to the optional quality management system requirement will meet this control',
      crosswalks: {
        'aiuc-1': ['E013'],
      },
    },
    {
      id: '8.2',
      title: 'AI risk assessment',
      domain: '8',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall perform AI risk assessments at planned intervals and when significant changes occur.',
      evidence: [
        {
          id: '8.2.1',
          kind: 'documentation',
          title: "AI risk assessment: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['C001', 'C008'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['C001', 'C008'],
      },
    },
    {
      id: '8.3',
      title: 'AI risk treatment',
      domain: '8',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall implement AI risk treatment plans and review them when assessments identify new or ineffective controls.',
      evidence: [
        {
          id: '8.3.1',
          kind: 'documentation',
          title: "AI risk treatment: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['C001', 'C008'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['C001', 'C008'],
      },
    },
    {
      id: '8.4',
      title: 'AI system impact assessment',
      domain: '8',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall perform AI system impact assessments at planned intervals and when significant changes are proposed.',
      evidence: [
        {
          id: '8.4.1',
          kind: 'documentation',
          title:
            "AI system impact assessment: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E013', 'C001'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 requires risk assessment and organizations can opt-in to the optional quality management system requirement, but does not require impact assessment specifically',
      crosswalks: {
        'aiuc-1': ['E013', 'C001'],
      },
    },
    {
      id: '9.1',
      title: 'Monitoring, measurement, analysis and evaluation',
      domain: '9',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall determine monitoring, measurement, analysis, and evaluation needed to ensure conformity and effectiveness.',
      evidence: [
        {
          id: '9.1.1',
          kind: 'documentation',
          title:
            "Monitoring, measurement, analysis and evaluation: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E013', 'C008'],
      coverage: 'full',
      coverage_note:
        'Organizations opting-in to the optional quality management system requirement will meet this control',
      crosswalks: {
        'aiuc-1': ['E013', 'C008'],
      },
    },
    {
      id: '9.2.1',
      title: 'Internal audit - General',
      domain: '9',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall conduct internal audits at planned intervals to provide information on the AI management system.',
      evidence: [
        {
          id: '9.2.1.1',
          kind: 'documentation',
          title: "Internal audit - General: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E008'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E008'],
      },
    },
    {
      id: '9.2.2',
      title: 'Internal audit programme',
      domain: '9',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'Top management shall review the AI management system at planned intervals for continuing suitability, adequacy, and effectiveness.',
      evidence: [
        {
          id: '9.2.2.1',
          kind: 'documentation',
          title: "Internal audit programme: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E008'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E008'],
      },
    },
    {
      id: '9.3.1',
      title: 'Management review - General',
      domain: '9',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall review the AI management system at planned intervals to ensure its suitability, adequacy, and effectiveness.',
      evidence: [
        {
          id: '9.3.1.1',
          kind: 'documentation',
          title:
            "Management review - General: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E008'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E008'],
      },
    },
    {
      id: '9.3.2',
      title: 'Management review inputs',
      domain: '9',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'Management review inputs shall include audits, performance trends, nonconformities, feedback, risks, changes, and resources.',
      evidence: [
        {
          id: '9.3.2.1',
          kind: 'documentation',
          title: "Management review inputs: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E008'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 internal review requirement is smaller in scope, so fulfilment of 9.3.2 depends on organizational implementation',
      crosswalks: {
        'aiuc-1': ['E008'],
      },
    },
    {
      id: '9.3.3',
      title: 'Management review results',
      domain: '9',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'Management review results shall include decisions on improvements, policy/objectives, resources, and follow-up actions.',
      evidence: [
        {
          id: '9.3.3.1',
          kind: 'documentation',
          title:
            "Management review results: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E008'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 internal review requirement is smaller in scope, so fulfilment of 9.3.2 depends on organizational implementation',
      crosswalks: {
        'aiuc-1': ['E008'],
      },
    },
    {
      id: '10.1',
      title: 'Continual improvement',
      domain: '10',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall continually improve the AI management system’s suitability, adequacy, and effectiveness.',
      evidence: [
        {
          id: '10.1.1',
          kind: 'documentation',
          title: "Continual improvement: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E013'],
      coverage: 'full',
      coverage_note:
        'Organizations opting-in to the optional quality management system requirement will meet this control',
      crosswalks: {
        'aiuc-1': ['E013'],
      },
    },
    {
      id: '10.2',
      title: 'Nonconformity and corrective action',
      domain: '10',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall address nonconformities by correcting them, dealing with consequences, and preventing recurrence.',
      evidence: [
        {
          id: '10.2.1',
          kind: 'documentation',
          title:
            "Nonconformity and corrective action: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E012', 'E013'],
      coverage: 'full',
      coverage_note:
        'Organizations opting-in to the optional quality management system requirement will meet this control',
      crosswalks: {
        'aiuc-1': ['E012', 'E013'],
      },
    },
    {
      id: 'A.2.2',
      title: 'AI policy',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall document a policy for the development or use of AI systems.',
      evidence: [
        {
          id: 'A.2.2.1',
          kind: 'documentation',
          title: "AI policy: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E010', 'E017'],
      coverage: 'full',
      coverage_note:
        'AI Acceptable Use Policy and Transparency Policy collectively fulfil the ISO control. Organizations may develop a standalone AI policy',
      crosswalks: {
        'aiuc-1': ['E010', 'E017'],
      },
    },
    {
      id: 'A.2.3',
      title: 'Alignment with other organizational policies',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        "The organization shall determine where other policies can be affected by or apply to the organization's objectives with respect to AI systems.",
      evidence: [
        {
          id: 'A.2.3.1',
          kind: 'documentation',
          title:
            "Alignment with other organizational policies: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E012', 'E008'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 does not require review of internal policies specifically, but require regulatory compliance reviews and regular internal reviews',
      crosswalks: {
        'aiuc-1': ['E012', 'E008'],
      },
    },
    {
      id: 'A.2.4',
      title: 'Review of the AI policy',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The AI policy shall be reviewed at planned intervals or additionally as needed to ensure its continuing suitability, adequacy and effectiveness.',
      evidence: [
        {
          id: 'A.2.4.1',
          kind: 'documentation',
          title: "Review of the AI policy: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E008', 'E017', 'E010'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E008', 'E017', 'E010'],
      },
    },
    {
      id: 'A.3.2',
      title: 'AI roles and responsibilities',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'Roles and responsibilities for AI shall be defined and allocated according to the needs of the organization.',
      evidence: [
        {
          id: 'A.3.2.1',
          kind: 'documentation',
          title:
            "AI roles and responsibilities: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E004'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E004'],
      },
    },
    {
      id: 'A.3.3',
      title: 'Reporting of concerns',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        "The organization shall define and put in place a process to report concerns about the organization's role with respect to an AI system throughout its life cycle.",
      evidence: [
        {
          id: 'A.3.3.1',
          kind: 'documentation',
          title: "Reporting of concerns: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E008'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 does not require internal reporting processes specifically, but require regular internal reviews',
      crosswalks: {
        'aiuc-1': ['E008'],
      },
    },
    {
      id: 'A.4.2',
      title: 'Resource documentation',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall identify and document relevant resources required for all activities at given AI system life cycle stages and other AI-related activities relevant for the organization.',
      evidence: [
        {
          id: 'A.4.2.1',
          kind: 'documentation',
          title: "Resource documentation: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E017', 'E013'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 does not require resource documentation specifically, but requires maintaining a centralized repository of system documentation and documenting resource management for organizations opting in to the optional quality management system requirement',
      crosswalks: {
        'aiuc-1': ['E017', 'E013'],
      },
    },
    {
      id: 'A.4.3',
      title: 'Data resources',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'As part of resource identification, the organization shall document information about the data resources utilized for the AI system.',
      evidence: [
        {
          id: 'A.4.3.1',
          kind: 'documentation',
          title: "Data resources: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E017'],
      coverage: 'full',
      coverage_note:
        'Fulfilled by organisations opting into the capability-specific requirement A103: Track training data lineage. In addition, E017: Document system transparency policy lists documenting datasheets in control activities',
      crosswalks: {
        'aiuc-1': ['E017'],
      },
    },
    {
      id: 'A.4.4',
      title: 'Tooling resources',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'As part of resource identification, the organization shall document information about the tooling resources utilized for the AI system.',
      evidence: [
        {
          id: 'A.4.4.1',
          kind: 'documentation',
          title: "Tooling resources: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E017'],
      coverage: 'full',
      coverage_note: 'Included in transparency policy control activities',
      crosswalks: {
        'aiuc-1': ['E017'],
      },
    },
    {
      id: 'A.4.5',
      title: 'System and computing resources',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'As part of resource identification, the organization shall document information about the system and computing resources utilized for the AI system.',
      evidence: [
        {
          id: 'A.4.5.1',
          kind: 'documentation',
          title:
            "System and computing resources: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E017'],
      coverage: 'full',
      coverage_note: 'Included in transparency policy control activities',
      crosswalks: {
        'aiuc-1': ['E017'],
      },
    },
    {
      id: 'A.4.6',
      title: 'Human resources',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'As part of resource identification, the organization shall document information about the human resources and their competences utilized for the development, deployment, operation, change management, maintenance, transfer and decommissioning, as well as verification and integration of the AI system.',
      evidence: [
        {
          id: 'A.4.6.1',
          kind: 'documentation',
          title: "Human resources: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E004'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 is scoped to require documentation of clear accountability assigned for system changes',
      crosswalks: {
        'aiuc-1': ['E004'],
      },
    },
    {
      id: 'A.5.2',
      title: 'AI system impact assessment process',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall establish a process to assess the potential consequences for individuals or groups of individuals, or both, and societies that can result from the AI system throughout its life cycle.',
      evidence: [
        {
          id: 'A.5.2.1',
          kind: 'documentation',
          title:
            "AI system impact assessment process: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['C001', 'E013'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 requires risk assessment and organizations can opt-in to the optional quality management system requirement, but does not require impact assessment specifically',
      crosswalks: {
        'aiuc-1': ['C001', 'E013'],
      },
    },
    {
      id: 'A.5.3',
      title: 'Documentation of AI system impact assessments',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall document the results of AI system impact assessments and retain results for a defined period.',
      evidence: [
        {
          id: 'A.5.3.1',
          kind: 'documentation',
          title:
            "Documentation of AI system impact assessments: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['C001', 'E013'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 requires risk assessment and organizations can opt-in to the optional quality management system requirement, but does not require impact assessment specifically',
      crosswalks: {
        'aiuc-1': ['C001', 'E013'],
      },
    },
    {
      id: 'A.5.4',
      title:
        'Assessing AI system impact on individuals or groups of individuals',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        "The organization shall assess and document the potential impacts of AI systems to individuals or groups of individuals throughout the system's life cycle.",
      evidence: [
        {
          id: 'A.5.4.1',
          kind: 'documentation',
          title:
            "Assessing AI system impact on individuals or groups of individuals: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['C001', 'C008', 'E013'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 requires risk assessment and organizations can opt-in to the optional quality management system requirement, but does not require impact assessment specifically',
      crosswalks: {
        'aiuc-1': ['C001', 'C008', 'E013'],
      },
    },
    {
      id: 'A.5.5',
      title: 'Assessing societal impacts of AI systems',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall assess and document the potential societal impacts of their AI systems throughout their life cycle.',
      evidence: [
        {
          id: 'A.5.5.1',
          kind: 'documentation',
          title:
            "Assessing societal impacts of AI systems: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['C001', 'F001', 'F002'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 requires risk assessment, but does not require impact assessment specifically. Impact on society is scoped to cyber and catastrophic misuse prevention',
      crosswalks: {
        'aiuc-1': ['C001', 'F001', 'F002'],
      },
    },
    {
      id: 'A.6.1.2',
      title: 'Objectives for responsible development of AI system',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall identify and document objectives to guide the responsible development AI systems, and take those objectives into account and integrate measures to achieve them in the development life cycle.',
      evidence: [
        {
          id: 'A.6.1.2.1',
          kind: 'documentation',
          title:
            "Objectives for responsible development of AI system: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['C007'],
      coverage: 'none',
      coverage_note:
        'Organizations pursuing AIUC-1 are naturally aligned with responsible AI principles, but AIUC-1 does not require documentation of responsible AI objectives specifically',
      crosswalks: {
        'aiuc-1': ['C007'],
      },
    },
    {
      id: 'A.6.1.3',
      title: 'Processes for responsible AI system design and development',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall define and document the specific processes for the responsible design and development of the AI system.',
      evidence: [
        {
          id: 'A.6.1.3.1',
          kind: 'documentation',
          title:
            "Processes for responsible AI system design and development: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: [],
      coverage: 'none',
      coverage_note:
        'Organizations pursuing AIUC-1 are naturally aligned with responsible AI principles, but AIUC-1 does not require documentation of responsible AI processes specifically',
      crosswalks: {
        'aiuc-1': [],
      },
    },
    {
      id: 'A.6.2.2',
      title: 'AI system requirements and specification',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall specify and document requirements for new AI systems or material enhancements to existing systems.',
      evidence: [
        {
          id: 'A.6.2.2.1',
          kind: 'documentation',
          title:
            "AI system requirements and specification: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E004', 'E007'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E004', 'E007'],
      },
    },
    {
      id: 'A.6.2.3',
      title: 'Documentation of AI system design and development',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall document the AI system design and development based on organizational objectives, documented requirements and specification criteria.',
      evidence: [
        {
          id: 'A.6.2.3.1',
          kind: 'documentation',
          title:
            "Documentation of AI system design and development: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E017', 'E013'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E017', 'E013'],
      },
    },
    {
      id: 'A.6.2.4',
      title: 'AI system verification and validation',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall define and document verification and validation measures for the AI system and specify criteria for their use.',
      evidence: [
        {
          id: 'A.6.2.4.1',
          kind: 'documentation',
          title:
            "AI system verification and validation: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E007', 'C002', 'C010', 'C011', 'C012', 'D002', 'D004'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E007', 'C002', 'C010', 'C011', 'C012', 'D002', 'D004'],
      },
    },
    {
      id: 'A.6.2.5',
      title: 'AI system deployment',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall document a deployment plan and ensure that appropriate requirements are met prior to deployment.',
      evidence: [
        {
          id: 'A.6.2.5.1',
          kind: 'documentation',
          title: "AI system deployment: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['C002'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['C002'],
      },
    },
    {
      id: 'A.6.2.6',
      title: 'AI system operation and monitoring',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall define and document the necessary elements for the ongoing operation of the AI system. At the minimum, this should include system and performance monitoring, repairs, updates and support.',
      evidence: [
        {
          id: 'A.6.2.6.1',
          kind: 'documentation',
          title:
            "AI system operation and monitoring: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['C008'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 is focused on monitoring risk categories and does not have product performance monitoring/product quality metrics in scope',
      crosswalks: {
        'aiuc-1': ['C008'],
      },
    },
    {
      id: 'A.6.2.7',
      title: 'AI system technical documentation',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall determine what AI system technical documentation is needed for each relevant category of interested parties, such as users, partners, supervisory authorities, and provide the technical documentation to them in the appropriate form.',
      evidence: [
        {
          id: 'A.6.2.7.1',
          kind: 'documentation',
          title:
            "AI system technical documentation: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E014', 'E013'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E014', 'E013'],
      },
    },
    {
      id: 'A.6.2.8',
      title: 'AI system recording of event logs',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall determine at which phases of the AI system life cycle, record keeping of event logs should be enabled, but at the minimum when the AI system is in use.',
      evidence: [
        {
          id: 'A.6.2.8.1',
          kind: 'documentation',
          title:
            "AI system recording of event logs: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E015'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E015'],
      },
    },
    {
      id: 'A.7.2',
      title: 'Data for development and enhancement of AI system',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall define, document and implement data management processes related to the development of AI systems.',
      evidence: [
        {
          id: 'A.7.2.1',
          kind: 'documentation',
          title:
            "Data for development and enhancement of AI system: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['A001'],
      coverage: 'full',
      coverage_note:
        'Met by organizations who opt-in to the capability specific requirements on training data quality and lineage',
      crosswalks: {
        'aiuc-1': ['A001'],
      },
    },
    {
      id: 'A.7.3',
      title: 'Acquisition of data',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall determine and document details about the acquisition and selection of the data used in AI systems.',
      evidence: [
        {
          id: 'A.7.3.1',
          kind: 'documentation',
          title: "Acquisition of data: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['A001'],
      coverage: 'full',
      coverage_note:
        'Met by organizations who opt-in to the capability specific requirement E103: Track training data lineage',
      crosswalks: {
        'aiuc-1': ['A001'],
      },
    },
    {
      id: 'A.7.4',
      title: 'Quality of data for AI systems',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall define and document requirements for data quality and ensure that data used to develop and operate the AI system meet those requirements.',
      evidence: [
        {
          id: 'A.7.4.1',
          kind: 'documentation',
          title:
            "Quality of data for AI systems: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: [],
      coverage: 'full',
      coverage_note:
        'Met by organizations who opt-in to the capability specific requirement on training data quality',
      crosswalks: {
        'aiuc-1': [],
      },
    },
    {
      id: 'A.7.5',
      title: 'Data provenance',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall define and document a process for recording the provenance of data used in its AI systems over the life cycles of the data and the AI system.',
      evidence: [
        {
          id: 'A.7.5.1',
          kind: 'documentation',
          title: "Data provenance: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E011', 'A007'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E011', 'A007'],
      },
    },
    {
      id: 'A.7.6',
      title: 'Data preparation',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall define and document its criteria for selecting data preparations and the data preparation methods to be used.',
      evidence: [
        {
          id: 'A.7.6.1',
          kind: 'documentation',
          title: "Data preparation: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: [],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 does not require data preparation methods specifically, but covers training data quality more broadly',
      crosswalks: {
        'aiuc-1': [],
      },
    },
    {
      id: 'A.8.2',
      title: 'System documentation and information for users',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall determine and provide the necessary information to users of the AI system.',
      evidence: [
        {
          id: 'A.8.2.1',
          kind: 'documentation',
          title:
            "System documentation and information for users: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E014', 'E016'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E014', 'E016'],
      },
    },
    {
      id: 'A.8.3',
      title: 'External reporting',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall provide capabilities for interested parties to report adverse impacts of the AI system.',
      evidence: [
        {
          id: 'A.8.3.1',
          kind: 'documentation',
          title: "External reporting: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['C009'],
      coverage: 'partial',
      coverage_note:
        'AIUC-1 requirement focuses on AI system users and does not require reporting capabilities for external parties',
      crosswalks: {
        'aiuc-1': ['C009'],
      },
    },
    {
      id: 'A.8.4',
      title: 'Communication of incidents',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall determine and document a plan for communicating incidents to users of the AI system.',
      evidence: [
        {
          id: 'A.8.4.1',
          kind: 'documentation',
          title:
            "Communication of incidents: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E001', 'E003', 'E002'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E001', 'E003', 'E002'],
      },
    },
    {
      id: 'A.8.5',
      title: 'Information for interested parties',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall determine and document their obligations to reporting information about the AI system to interested parties.',
      evidence: [
        {
          id: 'A.8.5.1',
          kind: 'documentation',
          title:
            "Information for interested parties: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E001', 'E012', 'E014'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E001', 'E012', 'E014'],
      },
    },
    {
      id: 'A.9.2',
      title: 'Processes for responsible use of AI systems',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall define and document the processes for the responsible use of AI systems.',
      evidence: [
        {
          id: 'A.9.2.1',
          kind: 'documentation',
          title:
            "Processes for responsible use of AI systems: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E010', 'C007', 'C008'],
      coverage: 'full',
      coverage_note:
        'AIUC-1 requires an Acceptable Use policy which covers prohibited use cases to ensure responsible use of AI systems. In addition, AIUC-1 has a number of concrete requirements ensuring responsible use of the AI system including, e.g., flagging high risk recommendations for human review and monitoring AI risk categories',
      crosswalks: {
        'aiuc-1': ['E010', 'C007', 'C008'],
      },
    },
    {
      id: 'A.9.3',
      title: 'Objectives for responsible use of AI system',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall identify and document objectives to guide the responsible use of AI systems.',
      evidence: [
        {
          id: 'A.9.3.1',
          kind: 'documentation',
          title:
            "Objectives for responsible use of AI system: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E010', 'C007'],
      coverage: 'partial',
      coverage_note:
        'Partially covered by Acceptable Use Policy, but AIUC-1 does not require documenting objectives specifically',
      crosswalks: {
        'aiuc-1': ['E010', 'C007'],
      },
    },
    {
      id: 'A.9.4',
      title: 'Intended use of the AI system',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall ensure that the AI system is used according to the intended uses of the AI system and its accompanying documentation.',
      evidence: [
        {
          id: 'A.9.4.1',
          kind: 'documentation',
          title:
            "Intended use of the AI system: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E010', 'C008'],
      coverage: 'full',
      coverage_note:
        'Acceptable Use Policy control activities require implementing detection and monitoring tools to track policy violations',
      crosswalks: {
        'aiuc-1': ['E010', 'C008'],
      },
    },
    {
      id: 'A.10.2',
      title: 'Allocating responsibilities',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall ensure that responsibilities within their AI system life cycle are allocated between the organization, its partners, suppliers, customers and third parties.',
      evidence: [
        {
          id: 'A.10.2.1',
          kind: 'documentation',
          title:
            "Allocating responsibilities: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E004'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E004'],
      },
    },
    {
      id: 'A.10.3',
      title: 'Suppliers',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        "The organization shall establish a process to ensure that its usage of services, products or materials provided by suppliers aligns with the organization's approach to the responsible development and use of AI systems.",
      evidence: [
        {
          id: 'A.10.3.1',
          kind: 'documentation',
          title: "Suppliers: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: ['E006'],
      coverage: 'full',
      crosswalks: {
        'aiuc-1': ['E006'],
      },
    },
    {
      id: 'A.10.4',
      title: 'Customers',
      domain: 'A',
      application: 'mandatory',
      retired: false,
      cadence_months: 12,
      summary:
        'The organization shall ensure that its responsible approach to the development and use of AI systems considers their customer expectations and needs.',
      evidence: [
        {
          id: 'A.10.4.1',
          kind: 'documentation',
          title: "Customers: the management system's own record",
          required: 'core',
        },
      ],
      covered_by: [],
      coverage: 'none',
      coverage_note:
        'AIUC-1 does not have specific requirements concerning customer expectations and needs, but covers a broad range of safeguards required to protect users of AI systems including regular testing that safeguards work',
      crosswalks: {
        'aiuc-1': [],
      },
    },
  ] as StandardControl[],
};

export const STANDARD_CATALOGUE: Record<string, StandardSpec> = {
  'aiuc-1': AIUC_1_STANDARD,
  'iso-42001': ISO_42001_STANDARD,
};

/** A standard by id. */
export function getStandard(standardId: string): StandardSpec | undefined {
  return STANDARD_CATALOGUE[standardId];
}

/** Every standard of the catalogue. */
export function listStandardSpecs(): StandardSpec[] {
  return Object.values(STANDARD_CATALOGUE);
}

/** One control of a standard, as the spec carries it. */
export function standardControl(
  standardId: string,
  controlId: string,
): StandardControl | undefined {
  return STANDARD_CATALOGUE[standardId]?.controls.find(
    control => control.id === controlId,
  );
}
