/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The chat's own words in the person's language (LOOP P-26): the composer's
 * placeholder and buttons, its error sentences, the tool lines and the tool
 * cards, the approvals, and the assistant's balloon — said in the six
 * languages the application's composer is said in (`interfaceWords`).
 *
 * The chat reads them in the language its host says (`ChatLanguage`, which
 * `AppRenderer` and the embed set from their `language`), else in the first
 * the browser prefers that is here, else in English: as an application's own
 * words are picked (`loop/apps/language`).
 *
 * Pure: no React ({@link useChatWords} is in `ChatLanguage`).
 *
 * @module chat/words
 */

import { pickLanguage } from '../loop/apps/language';

/** A tool line's words around the tool's name: "Using " list_invoices "…". */
export type AroundName = { before: string; after: string };

/** What the chat says itself, in one language. */
export type ChatWords = {
  // The composer.
  /** The prompt's placeholder in a LOOP workspace. */
  placeholder: string;
  /** The prompt's placeholder when nothing else says one. */
  typeMessage: string;
  /** The prompt's name for a screen reader. */
  messageInput: string;
  send: string;
  stop: string;
  pauseKernelBusy: string;
  /** The starters under the prompt, for a screen reader. */
  suggestedPrompts: string;
  /** A demo's shared key has run out. */
  demoKeyExpired: string;
  /** The person's key has run out. */
  keyExpired: string;
  /** The empty chat's title. */
  startConversation: string;
  /** The empty chat's line when it has no starters. */
  sendToBegin: string;
  copyTurn: string;
  removeTurn: string;
  /** What the agent says when its answer failed. */
  error: (message: string) => string;
  /** While the agent thinks, in the balloon. */
  thinking: string;
  // The tool cards.
  toolPreparing: string;
  toolExecuting: string;
  toolComplete: string;
  toolExecutionFailed: string;
  toolCodeError: string;
  toolExited: string;
  toolFailed: string;
  awaitingApproval: string;
  noParameters: string;
  /** More arguments than the summary shows: "(+2 more)". */
  moreArguments: (count: number) => string;
  parameters: string;
  result: string;
  executionError: string;
  executionErrorWhy: string;
  errorHeading: string;
  processExited: string;
  exitedWithCode: (code: number | string) => string;
  nonZeroExit: string;
  // The tool lines (the balloon's, and a screen reader's).
  toolRunning: AroundName;
  toolDone: AroundName;
  toolFailedLine: AroundName;
  // Approvals.
  approve: string;
  deny: string;
  approveAll: string;
  approvalNeeded: string;
  approvedRunning: string;
  approvedElsewhere: string;
  deniedWontRun: string;
  decidedElsewhere: string;
  approvalsPending: (count: number) => string;
  toolApprovalsPending: string;
  collapse: string;
  review: string;
  dismiss: string;
  approvalTitle: string;
  arguments: string;
  approvalWarning: string;
  rememberChoice: string;
  // The assistant's balloon.
  /** An approval waits and cannot be answered in the balloon itself. */
  waitingOpen: string;
  /** It waits on the person's yes. */
  waitingForYou: string;
  /** Its deployment is paused. */
  paused: string;
  /** How many more approvals wait: "2 more". */
  moreWaiting: (count: number) => string;
  showMore: string;
  showLess: string;
  now: string;
  conversation: string;
  suggestions: string;
  expandConversation: string;
  expand: string;
  expandWhat: (what: string) => string;
  theVisual: string;
  /** The floating button's tooltip. */
  talkTo: (name: string) => string;
};

/** The chat's words, by language. Another language reads English. */
export const CHAT_WORDS: Record<string, ChatWords> = {
  en: {
    placeholder: 'Ask anything, type / for commands or @ for mention',
    typeMessage: 'Type a message...',
    messageInput: 'Message input',
    send: 'Send',
    stop: 'Stop',
    pauseKernelBusy: 'Pause (kernel busy)',
    suggestedPrompts: 'Suggested prompts',
    demoKeyExpired:
      'This demo runs on a shared key, and its time is up. Sign in to keep going.',
    keyExpired: 'Your key has expired. Sign in to keep going.',
    startConversation: 'Start a conversation',
    sendToBegin: 'Send a message to begin chatting',
    copyTurn: 'Copy this turn',
    removeTurn: 'Remove this turn',
    error: message => `Error: ${message}`,
    thinking: 'Thinking…',
    toolPreparing: 'Preparing...',
    toolExecuting: 'Executing...',
    toolComplete: 'Complete',
    toolExecutionFailed: 'Execution Failed',
    toolCodeError: 'Code Error',
    toolExited: 'Exited',
    toolFailed: 'Failed',
    awaitingApproval: 'Awaiting Approval',
    noParameters: 'No parameters',
    moreArguments: count => `(+${count} more)`,
    parameters: 'Parameters',
    result: 'Result',
    executionError: 'Execution Error',
    executionErrorWhy:
      'The sandbox or execution environment failed to run the code.',
    errorHeading: 'Error',
    processExited: 'Process Exited',
    exitedWithCode: code => `Process exited with code ${code}`,
    nonZeroExit: 'The code called sys.exit() with a non-zero exit code.',
    toolRunning: { before: 'Using ', after: '…' },
    toolDone: { before: 'Done: ', after: '' },
    toolFailedLine: { before: '', after: ' failed' },
    approve: 'Approve',
    deny: 'Deny',
    approveAll: 'Approve all',
    approvalNeeded: 'This tool requires your approval to run.',
    approvedRunning: 'Approved. Executing tool.',
    approvedElsewhere: 'Approved from sidebar.',
    deniedWontRun: 'Denied. Tool will not run.',
    decidedElsewhere: 'Decision came from sidebar.',
    approvalsPending: count =>
      `${count} tool ${count === 1 ? 'approval' : 'approvals'} pending`,
    toolApprovalsPending: 'Tool approvals pending',
    collapse: 'Collapse',
    review: 'Review',
    dismiss: 'Dismiss',
    approvalTitle: 'Tool Approval Required',
    arguments: 'Arguments:',
    approvalWarning:
      'This tool will perform an action on your behalf. Please review the arguments before approving.',
    rememberChoice: 'Remember my choice for this tool',
    waitingOpen: 'Waiting for you — open the conversation to answer.',
    waitingForYou: 'Waiting for you',
    paused: 'Paused — it answers again once it is resumed.',
    moreWaiting: count => `${count} more`,
    showMore: 'more',
    showLess: 'less',
    now: 'Now',
    conversation: 'Conversation',
    suggestions: 'Suggestions',
    expandConversation: 'Expand the conversation',
    expand: 'Expand',
    expandWhat: what => `Expand ${what}`,
    theVisual: 'the visual',
    talkTo: name => `Talk to ${name}`,
  },
  fr: {
    placeholder:
      'Demandez ce que vous voulez, tapez / pour les commandes ou @ pour mentionner',
    typeMessage: 'Écrivez un message...',
    messageInput: 'Saisie du message',
    send: 'Envoyer',
    stop: 'Arrêter',
    pauseKernelBusy: 'Pause (noyau occupé)',
    suggestedPrompts: 'Suggestions de questions',
    demoKeyExpired:
      'Cette démo utilise une clé partagée, et son temps est écoulé. Connectez-vous pour continuer.',
    keyExpired: 'Votre clé a expiré. Connectez-vous pour continuer.',
    startConversation: 'Commencer une conversation',
    sendToBegin: 'Envoyez un message pour commencer',
    copyTurn: 'Copier cet échange',
    removeTurn: 'Supprimer cet échange',
    error: message => `Erreur : ${message}`,
    thinking: 'Réflexion…',
    toolPreparing: 'Préparation...',
    toolExecuting: 'Exécution...',
    toolComplete: 'Terminé',
    toolExecutionFailed: 'Échec de l’exécution',
    toolCodeError: 'Erreur dans le code',
    toolExited: 'Arrêté',
    toolFailed: 'Échec',
    awaitingApproval: 'En attente d’approbation',
    noParameters: 'Aucun paramètre',
    moreArguments: count => `(+${count} de plus)`,
    parameters: 'Paramètres',
    result: 'Résultat',
    executionError: 'Erreur d’exécution',
    executionErrorWhy:
      'Le bac à sable ou l’environnement d’exécution n’a pas pu exécuter le code.',
    errorHeading: 'Erreur',
    processExited: 'Processus arrêté',
    exitedWithCode: code => `Le processus s’est arrêté avec le code ${code}`,
    nonZeroExit: 'Le code a appelé sys.exit() avec un code de sortie non nul.',
    toolRunning: { before: 'Utilise ', after: '…' },
    toolDone: { before: 'Terminé : ', after: '' },
    toolFailedLine: { before: '', after: ' a échoué' },
    approve: 'Approuver',
    deny: 'Refuser',
    approveAll: 'Tout approuver',
    approvalNeeded: 'Cet outil a besoin de votre approbation pour s’exécuter.',
    approvedRunning: 'Approuvé. Exécution de l’outil.',
    approvedElsewhere: 'Approuvé depuis le panneau latéral.',
    deniedWontRun: 'Refusé. L’outil ne s’exécutera pas.',
    decidedElsewhere: 'Décision prise depuis le panneau latéral.',
    approvalsPending: count =>
      count === 1
        ? '1 approbation d’outil en attente'
        : `${count} approbations d’outil en attente`,
    toolApprovalsPending: 'Approbations d’outil en attente',
    collapse: 'Réduire',
    review: 'Examiner',
    dismiss: 'Fermer',
    approvalTitle: 'Approbation d’outil requise',
    arguments: 'Arguments :',
    approvalWarning:
      'Cet outil va agir en votre nom. Vérifiez ses arguments avant de l’approuver.',
    rememberChoice: 'Mémoriser mon choix pour cet outil',
    waitingOpen: 'Il vous attend — ouvrez la conversation pour répondre.',
    waitingForYou: 'Il vous attend',
    paused: 'En pause — il répondra de nouveau une fois relancé.',
    moreWaiting: count => `${count} de plus`,
    showMore: 'plus',
    showLess: 'moins',
    now: 'Maintenant',
    conversation: 'Conversation',
    suggestions: 'Suggestions',
    expandConversation: 'Agrandir la conversation',
    expand: 'Agrandir',
    expandWhat: what => `Agrandir ${what}`,
    theVisual: 'le visuel',
    talkTo: name => `Parler à ${name}`,
  },
  es: {
    placeholder:
      'Pregunta lo que quieras, escribe / para comandos o @ para mencionar',
    typeMessage: 'Escribe un mensaje...',
    messageInput: 'Entrada del mensaje',
    send: 'Enviar',
    stop: 'Detener',
    pauseKernelBusy: 'Pausa (kernel ocupado)',
    suggestedPrompts: 'Preguntas sugeridas',
    demoKeyExpired:
      'Esta demo usa una clave compartida y su tiempo se ha agotado. Inicia sesión para continuar.',
    keyExpired: 'Tu clave ha caducado. Inicia sesión para continuar.',
    startConversation: 'Empieza una conversación',
    sendToBegin: 'Envía un mensaje para empezar',
    copyTurn: 'Copiar este turno',
    removeTurn: 'Eliminar este turno',
    error: message => `Error: ${message}`,
    thinking: 'Pensando…',
    toolPreparing: 'Preparando...',
    toolExecuting: 'Ejecutando...',
    toolComplete: 'Completado',
    toolExecutionFailed: 'Falló la ejecución',
    toolCodeError: 'Error en el código',
    toolExited: 'Terminado',
    toolFailed: 'Falló',
    awaitingApproval: 'Esperando aprobación',
    noParameters: 'Sin parámetros',
    moreArguments: count => `(+${count} más)`,
    parameters: 'Parámetros',
    result: 'Resultado',
    executionError: 'Error de ejecución',
    executionErrorWhy:
      'El sandbox o el entorno de ejecución no pudo ejecutar el código.',
    errorHeading: 'Error',
    processExited: 'Proceso terminado',
    exitedWithCode: code => `El proceso terminó con el código ${code}`,
    nonZeroExit:
      'El código llamó a sys.exit() con un código de salida distinto de cero.',
    toolRunning: { before: 'Usando ', after: '…' },
    toolDone: { before: 'Hecho: ', after: '' },
    toolFailedLine: { before: '', after: ' falló' },
    approve: 'Aprobar',
    deny: 'Rechazar',
    approveAll: 'Aprobar todo',
    approvalNeeded: 'Esta herramienta necesita tu aprobación para ejecutarse.',
    approvedRunning: 'Aprobado. Ejecutando la herramienta.',
    approvedElsewhere: 'Aprobado desde el panel lateral.',
    deniedWontRun: 'Rechazado. La herramienta no se ejecutará.',
    decidedElsewhere: 'Decisión tomada desde el panel lateral.',
    approvalsPending: count =>
      count === 1
        ? '1 aprobación de herramienta pendiente'
        : `${count} aprobaciones de herramientas pendientes`,
    toolApprovalsPending: 'Aprobaciones de herramientas pendientes',
    collapse: 'Contraer',
    review: 'Revisar',
    dismiss: 'Cerrar',
    approvalTitle: 'Se necesita aprobar la herramienta',
    arguments: 'Argumentos:',
    approvalWarning:
      'Esta herramienta actuará en tu nombre. Revisa sus argumentos antes de aprobarla.',
    rememberChoice: 'Recordar mi elección para esta herramienta',
    waitingOpen: 'Te está esperando: abre la conversación para responder.',
    waitingForYou: 'Te está esperando',
    paused: 'En pausa: responderá de nuevo cuando se reanude.',
    moreWaiting: count => `${count} más`,
    showMore: 'más',
    showLess: 'menos',
    now: 'Ahora',
    conversation: 'Conversación',
    suggestions: 'Sugerencias',
    expandConversation: 'Ampliar la conversación',
    expand: 'Ampliar',
    expandWhat: what => `Ampliar ${what}`,
    theVisual: 'el visual',
    talkTo: name => `Hablar con ${name}`,
  },
  de: {
    placeholder: 'Frag, was du willst – / für Befehle, @ zum Erwähnen',
    typeMessage: 'Nachricht schreiben...',
    messageInput: 'Nachrichteneingabe',
    send: 'Senden',
    stop: 'Stoppen',
    pauseKernelBusy: 'Pause (Kernel beschäftigt)',
    suggestedPrompts: 'Vorgeschlagene Fragen',
    demoKeyExpired:
      'Diese Demo läuft mit einem geteilten Schlüssel, und ihre Zeit ist abgelaufen. Melde dich an, um weiterzumachen.',
    keyExpired:
      'Dein Schlüssel ist abgelaufen. Melde dich an, um weiterzumachen.',
    startConversation: 'Ein Gespräch beginnen',
    sendToBegin: 'Sende eine Nachricht, um zu beginnen',
    copyTurn: 'Diesen Austausch kopieren',
    removeTurn: 'Diesen Austausch entfernen',
    error: message => `Fehler: ${message}`,
    thinking: 'Denkt nach…',
    toolPreparing: 'Wird vorbereitet...',
    toolExecuting: 'Wird ausgeführt...',
    toolComplete: 'Fertig',
    toolExecutionFailed: 'Ausführung fehlgeschlagen',
    toolCodeError: 'Fehler im Code',
    toolExited: 'Beendet',
    toolFailed: 'Fehlgeschlagen',
    awaitingApproval: 'Wartet auf Freigabe',
    noParameters: 'Keine Parameter',
    moreArguments: count => `(+${count} weitere)`,
    parameters: 'Parameter',
    result: 'Ergebnis',
    executionError: 'Ausführungsfehler',
    executionErrorWhy:
      'Die Sandbox oder die Ausführungsumgebung konnte den Code nicht ausführen.',
    errorHeading: 'Fehler',
    processExited: 'Prozess beendet',
    exitedWithCode: code => `Der Prozess wurde mit Code ${code} beendet`,
    nonZeroExit:
      'Der Code hat sys.exit() mit einem Exit-Code ungleich null aufgerufen.',
    toolRunning: { before: 'Verwendet ', after: '…' },
    toolDone: { before: 'Fertig: ', after: '' },
    toolFailedLine: { before: '', after: ' fehlgeschlagen' },
    approve: 'Freigeben',
    deny: 'Ablehnen',
    approveAll: 'Alle freigeben',
    approvalNeeded: 'Dieses Werkzeug braucht deine Freigabe, um zu laufen.',
    approvedRunning: 'Freigegeben. Das Werkzeug wird ausgeführt.',
    approvedElsewhere: 'In der Seitenleiste freigegeben.',
    deniedWontRun: 'Abgelehnt. Das Werkzeug wird nicht ausgeführt.',
    decidedElsewhere: 'In der Seitenleiste entschieden.',
    approvalsPending: count =>
      count === 1
        ? '1 Werkzeugfreigabe ausstehend'
        : `${count} Werkzeugfreigaben ausstehend`,
    toolApprovalsPending: 'Werkzeugfreigaben ausstehend',
    collapse: 'Einklappen',
    review: 'Prüfen',
    dismiss: 'Schließen',
    approvalTitle: 'Werkzeugfreigabe erforderlich',
    arguments: 'Argumente:',
    approvalWarning:
      'Dieses Werkzeug handelt in deinem Namen. Prüfe seine Argumente, bevor du es freigibst.',
    rememberChoice: 'Meine Wahl für dieses Werkzeug merken',
    waitingOpen: 'Wartet auf dich – öffne das Gespräch, um zu antworten.',
    waitingForYou: 'Wartet auf dich',
    paused: 'Pausiert – antwortet wieder, sobald es fortgesetzt wird.',
    moreWaiting: count => `${count} weitere`,
    showMore: 'mehr',
    showLess: 'weniger',
    now: 'Jetzt',
    conversation: 'Gespräch',
    suggestions: 'Vorschläge',
    expandConversation: 'Gespräch vergrößern',
    expand: 'Vergrößern',
    expandWhat: what => `${what} vergrößern`,
    theVisual: 'die Darstellung',
    talkTo: name => `Mit ${name} sprechen`,
  },
  it: {
    placeholder:
      'Chiedi quello che vuoi, digita / per i comandi o @ per menzionare',
    typeMessage: 'Scrivi un messaggio...',
    messageInput: 'Campo del messaggio',
    send: 'Invia',
    stop: 'Interrompi',
    pauseKernelBusy: 'Pausa (kernel occupato)',
    suggestedPrompts: 'Domande suggerite',
    demoKeyExpired:
      'Questa demo usa una chiave condivisa e il suo tempo è scaduto. Accedi per continuare.',
    keyExpired: 'La tua chiave è scaduta. Accedi per continuare.',
    startConversation: 'Inizia una conversazione',
    sendToBegin: 'Invia un messaggio per iniziare',
    copyTurn: 'Copia questo scambio',
    removeTurn: 'Rimuovi questo scambio',
    error: message => `Errore: ${message}`,
    thinking: 'Sta pensando…',
    toolPreparing: 'Preparazione...',
    toolExecuting: 'Esecuzione...',
    toolComplete: 'Completato',
    toolExecutionFailed: 'Esecuzione non riuscita',
    toolCodeError: 'Errore nel codice',
    toolExited: 'Terminato',
    toolFailed: 'Non riuscito',
    awaitingApproval: 'In attesa di approvazione',
    noParameters: 'Nessun parametro',
    moreArguments: count => `(+${count} altri)`,
    parameters: 'Parametri',
    result: 'Risultato',
    executionError: 'Errore di esecuzione',
    executionErrorWhy:
      'La sandbox o l’ambiente di esecuzione non è riuscito a eseguire il codice.',
    errorHeading: 'Errore',
    processExited: 'Processo terminato',
    exitedWithCode: code => `Il processo è terminato con il codice ${code}`,
    nonZeroExit:
      'Il codice ha chiamato sys.exit() con un codice di uscita diverso da zero.',
    toolRunning: { before: 'Usa ', after: '…' },
    toolDone: { before: 'Fatto: ', after: '' },
    toolFailedLine: { before: '', after: ' non riuscito' },
    approve: 'Approva',
    deny: 'Rifiuta',
    approveAll: 'Approva tutto',
    approvalNeeded:
      'Questo strumento ha bisogno della tua approvazione per essere eseguito.',
    approvedRunning: 'Approvato. Esecuzione dello strumento.',
    approvedElsewhere: 'Approvato dal pannello laterale.',
    deniedWontRun: 'Rifiutato. Lo strumento non verrà eseguito.',
    decidedElsewhere: 'Decisione presa dal pannello laterale.',
    approvalsPending: count =>
      count === 1
        ? '1 approvazione di strumento in attesa'
        : `${count} approvazioni di strumenti in attesa`,
    toolApprovalsPending: 'Approvazioni di strumenti in attesa',
    collapse: 'Comprimi',
    review: 'Esamina',
    dismiss: 'Chiudi',
    approvalTitle: 'Approvazione dello strumento richiesta',
    arguments: 'Argomenti:',
    approvalWarning:
      'Questo strumento agirà per tuo conto. Controlla i suoi argomenti prima di approvarlo.',
    rememberChoice: 'Ricorda la mia scelta per questo strumento',
    waitingOpen: 'Ti sta aspettando: apri la conversazione per rispondere.',
    waitingForYou: 'Ti sta aspettando',
    paused: 'In pausa: risponderà di nuovo quando verrà ripreso.',
    moreWaiting: count => `altri ${count}`,
    showMore: 'altro',
    showLess: 'meno',
    now: 'Ora',
    conversation: 'Conversazione',
    suggestions: 'Suggerimenti',
    expandConversation: 'Espandi la conversazione',
    expand: 'Espandi',
    expandWhat: what => `Espandi ${what}`,
    theVisual: 'la visualizzazione',
    talkTo: name => `Parla con ${name}`,
  },
  pt: {
    placeholder:
      'Pergunte o que quiser, digite / para comandos ou @ para mencionar',
    typeMessage: 'Escreva uma mensagem...',
    messageInput: 'Campo da mensagem',
    send: 'Enviar',
    stop: 'Parar',
    pauseKernelBusy: 'Pausar (kernel ocupado)',
    suggestedPrompts: 'Perguntas sugeridas',
    demoKeyExpired:
      'Esta demonstração usa uma chave compartilhada e o tempo dela acabou. Entre para continuar.',
    keyExpired: 'Sua chave expirou. Entre para continuar.',
    startConversation: 'Comece uma conversa',
    sendToBegin: 'Envie uma mensagem para começar',
    copyTurn: 'Copiar esta troca',
    removeTurn: 'Remover esta troca',
    error: message => `Erro: ${message}`,
    thinking: 'Pensando…',
    toolPreparing: 'Preparando...',
    toolExecuting: 'Executando...',
    toolComplete: 'Concluído',
    toolExecutionFailed: 'Falha na execução',
    toolCodeError: 'Erro no código',
    toolExited: 'Encerrado',
    toolFailed: 'Falhou',
    awaitingApproval: 'Aguardando aprovação',
    noParameters: 'Sem parâmetros',
    moreArguments: count => `(+${count} mais)`,
    parameters: 'Parâmetros',
    result: 'Resultado',
    executionError: 'Erro de execução',
    executionErrorWhy:
      'O sandbox ou o ambiente de execução não conseguiu executar o código.',
    errorHeading: 'Erro',
    processExited: 'Processo encerrado',
    exitedWithCode: code => `O processo terminou com o código ${code}`,
    nonZeroExit:
      'O código chamou sys.exit() com um código de saída diferente de zero.',
    toolRunning: { before: 'Usando ', after: '…' },
    toolDone: { before: 'Concluído: ', after: '' },
    toolFailedLine: { before: '', after: ' falhou' },
    approve: 'Aprovar',
    deny: 'Recusar',
    approveAll: 'Aprovar tudo',
    approvalNeeded:
      'Esta ferramenta precisa da sua aprovação para ser executada.',
    approvedRunning: 'Aprovado. Executando a ferramenta.',
    approvedElsewhere: 'Aprovado pelo painel lateral.',
    deniedWontRun: 'Recusado. A ferramenta não será executada.',
    decidedElsewhere: 'Decisão tomada pelo painel lateral.',
    approvalsPending: count =>
      count === 1
        ? '1 aprovação de ferramenta pendente'
        : `${count} aprovações de ferramentas pendentes`,
    toolApprovalsPending: 'Aprovações de ferramentas pendentes',
    collapse: 'Recolher',
    review: 'Revisar',
    dismiss: 'Fechar',
    approvalTitle: 'Aprovação da ferramenta necessária',
    arguments: 'Argumentos:',
    approvalWarning:
      'Esta ferramenta vai agir em seu nome. Revise os argumentos antes de aprovar.',
    rememberChoice: 'Lembrar minha escolha para esta ferramenta',
    waitingOpen: 'Esperando por você — abra a conversa para responder.',
    waitingForYou: 'Esperando por você',
    paused: 'Em pausa — volta a responder quando for retomado.',
    moreWaiting: count => `mais ${count}`,
    showMore: 'mais',
    showLess: 'menos',
    now: 'Agora',
    conversation: 'Conversa',
    suggestions: 'Sugestões',
    expandConversation: 'Ampliar a conversa',
    expand: 'Ampliar',
    expandWhat: what => `Ampliar ${what}`,
    theVisual: 'o visual',
    talkTo: name => `Falar com ${name}`,
  },
};

/** The English words: what the chat says when nothing says a language. */
export const ENGLISH_CHAT_WORDS: ChatWords = CHAT_WORDS.en;

/**
 * The language the chat speaks to a person who prefers these, as BCP 47
 * tags them: the first it is said in (`fr-CA` reads `fr`), else English.
 */
export function chatLanguage(preferred: readonly string[]): string {
  return pickLanguage(Object.keys(CHAT_WORDS), preferred) ?? 'en';
}

/** The chat's words in a language: its own, else its language's, else English. */
export function chatWords(language: string | undefined): ChatWords {
  return CHAT_WORDS[chatLanguage(language ? [language] : [])];
}
