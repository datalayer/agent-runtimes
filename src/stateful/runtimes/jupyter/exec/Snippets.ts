/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import * as Python from './Python';

/**
 * Runtime snippets.
 */
export interface IRuntimeSnippets {
  /**
   * Code snippet to change the current working directory.
   *
   * @param path New current directory
   * @returns The code snippet
   */
  changeCurrentWorkingDirectory(path: string): string;

  /**
   * Code snippet to list the transferable kernel variables.
   *
   * @returns The code snippet
   */
  listVariables(): string;

  /**
   * Code snippet to load kernel variables.
   *
   * @param variables Serialized-JSON dictionary (<variable name>, <variable value blob>)
   * @returns The code snippet
   */
  loadVariables(variables: string): string;

  /**
   * Code snippet to save kernel variables.
   *
   * @param variables Variable names.
   * @returns The code snippet
   */
  saveVariables(variables: string[]): string;

  /**
   * Extract output variables candidates by parsing the cell content.
   *
   * @param code Cell code source
   * @returns The output variable candidates
   */
  getOutputCandidates(code: string): string[];
}

/**
 * Facade to interact with kernels by requesting code execution.
 */
export class RuntimeSnippetsFacade {
  private static $language = new Map<string, IRuntimeSnippets>();

  /**
   * Register a facade for a given language
   *
   * @param language Kernel language
   * @param API Kernel API
   */
  static register(language: string, API: IRuntimeSnippets): void {
    this.$language.set(language, API);
  }

  /**
   * Whether there is an API for the given kernel language
   *
   * @param language Kernel language
   */
  static supports(language: string): boolean {
    return this.$language.has(language);
  }

  private _language: string;

  /**
   * Create a kernel snippet generator for a given kernel language.
   *
   * @param language Kernel language
   */
  constructor(language: string) {
    if (!RuntimeSnippetsFacade.$language.has(language)) {
      throw new Error(`${language} is not supported.`);
    }
    this._language = language;
  }

  /**
   * Kernel language
   */
  get language(): string {
    return this._language;
  }

  /**
   * Code snippet to change the current working directory.
   *
   * The code snippet has no returned value.
   *
   * @param path New current directory
   * @returns The code snippet
   */
  changeCurrentWorkingDirectory(path: string): string {
    return RuntimeSnippetsFacade.$language
      .get(this.language)!
      .changeCurrentWorkingDirectory(path);
  }

  /**
   * Code snippet to list the transferable kernel variables.
   *
   * @returns The code snippet
   */
  listVariables(): string {
    return RuntimeSnippetsFacade.$language.get(this.language)!.listVariables();
  }

  /**
   * Code snippet to load kernel variables.
   *
   * @param variables Serialized-JSON dictionary (<variable name>, <variable value blob>)
   * @returns The code snippet
   */
  loadVariables(variables: string): string {
    return RuntimeSnippetsFacade.$language
      .get(this.language)!
      .loadVariables(variables);
  }

  /**
   * Code snippet to save kernel variables.
   *
   * @param variables Variable names.
   * @returns The code snippet
   */
  saveVariables(variables: string[]): string {
    return RuntimeSnippetsFacade.$language
      .get(this.language)!
      .saveVariables(variables);
  }

  /**
   * Extract output variables candidates by parsing the cell content.
   *
   * @param code Cell code source
   * @returns The output variable candidates
   */
  getOutputCandidates(code: string): string[] {
    return RuntimeSnippetsFacade.$language
      .get(this.language)!
      .getOutputCandidates(code);
  }
}

RuntimeSnippetsFacade.register('python', Python);
