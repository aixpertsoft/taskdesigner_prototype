/* ===========================================================================
   Task definitions — pure data, no logic.

   This is the document that would live on the server as GET /taskdefinitions.
   The `window.TASK_DEFINITIONS =` assignment exists for one reason only: a
   browser opened from file:// may not fetch() a sibling .json, and this
   prototype has to survive being double-clicked. Everything from the first
   brace to the last is strict JSON — quoted keys, no functions, no comments.
   Delete the assignment line and the remainder is a valid .json document.

   Behind a real server this whole file becomes one line — a fetch of
   /taskdefinitions — and nothing else in the prototype changes.

   SHAPE
     Shared by every task type:
       name, label, icon, description, kind, params
         params  = the configuration UI: what the REQUESTER fills in when they
                   add this task to a request.

     kind: "SERVER"  ->  serverActionConfig
         action   = the annotated Groovy/Java the server already exposes
         inputs   = where each of that action's parameters comes from
         outputs  = where each of its return values is stored on the request

     kind: "MANUAL"  ->  manualTaskConfig
         resultParams     = what the PERSON supplies to close it
         onRefusalDefault = what declining does, unless the task overrides it

   The three input source kinds are the only three there are — LITERAL,
   REQUEST_DATA, TASK_PARAM. Resolution is a dictionary lookup; nothing is
   parsed or evaluated. The dollar-brace form you see in the editor is
   generated from these records for people to read, and never read back.
   =========================================================================== */
window.TASK_DEFINITIONS = {
  "apiVersion": "aixboms.taskdefinition/v1",
  "definitions": [
    {
      "name": "cablePatch",
      "label": "Cable Patch",
      "icon": "cable",
      "description": "Connect or disconnect a cable between two ports.",
      "kind": "SERVER",
      "params": [
        {"name": "operation",  "label": "Operation",   "type": "enum", "required": true,
         "values": ["Connect", "Disconnect"]},
        {"name": "sourcePort", "label": "Source port", "type": "text", "required": true,
         "placeholder": "RCK-R12-SW01 / Gi1/0/24"},
        {"name": "targetPort", "label": "Target port", "type": "text", "required": true,
         "placeholder": "PP-3 / Port 24"},
        {"name": "cableType",  "label": "Cable type",  "type": "enum",
         "values": ["Cat6a", "OM4 LC-LC", "OS2 LC-LC"]}
      ],
      "serverActionConfig": {
        "action": "cablePatch",
        "inputs": [
          {"target": "operation",  "source": {"kind": "TASK_PARAM", "path": "operation"}},
          {"target": "sourcePort", "source": {"kind": "TASK_PARAM", "path": "sourcePort"}},
          {"target": "targetPort", "source": {"kind": "TASK_PARAM", "path": "targetPort"}},
          {"target": "cableType",  "source": {"kind": "TASK_PARAM", "path": "cableType"}}
        ],
        "outputs": []
      }
    },
    {
      "name": "portReserve",
      "label": "Port Reservation",
      "icon": "port",
      "description": "Reserve a switch port so nobody else can claim it.",
      "kind": "SERVER",
      "params": [
        {"name": "device", "label": "Device", "type": "text", "required": true,
         "placeholder": "RCK-R12-SW01"},
        {"name": "port",   "label": "Port",   "type": "text", "required": true,
         "placeholder": "Gi1/0/25"},
        {"name": "until",  "label": "Reserved until", "type": "text",
         "placeholder": "2026-09-30"}
      ],
      "serverActionConfig": {
        "action": "reservePort",
        "inputs": [
          {"target": "device", "source": {"kind": "TASK_PARAM", "path": "device"}},
          {"target": "port",   "source": {"kind": "TASK_PARAM", "path": "port"}},
          {"target": "until",  "source": {"kind": "TASK_PARAM", "path": "until"}}
        ],
        "outputs": []
      }
    },
    {
      "name": "helloWorld",
      "label": "Hello World",
      "icon": "hello",
      "description": "Prints a greeting on the server. Used to prove the plumbing.",
      "kind": "SERVER",
      "params": [
        {"name": "greeting", "label": "Greeting", "type": "text", "required": true,
         "placeholder": "Guten Morgen"}
      ],
      "serverActionConfig": {
        "action": "printMessage",
        "inputs": [
          {"target": "message", "source": {"kind": "TASK_PARAM", "path": "greeting"}},
          {"target": "level",   "source": {"kind": "LITERAL",    "value": "INFO"}}
        ],
        "outputs": []
      }
    },
    {
      "name": "genDoc",
      "label": "Generate document",
      "icon": "doc",
      "description": "Produces the change documentation and stores its id on the request.",
      "kind": "SERVER",
      "params": [
        {"name": "template", "label": "Template", "type": "enum", "required": true,
         "values": ["Change record", "Decommission report"]}
      ],
      "serverActionConfig": {
        "action": "generateDocument",
        "inputs": [
          {"target": "template", "source": {"kind": "TASK_PARAM",   "path": "template"}},
          {"target": "subject",  "source": {"kind": "REQUEST_DATA", "path": "changeTicket"}}
        ],
        "outputs": [
          {"source": "documentId", "target": {"kind": "REQUEST_DATA", "path": "documentId"}},
          {"source": "fileName",   "target": {"kind": "REQUEST_DATA", "path": "documentFile"}}
        ]
      }
    },
    {
      "name": "signOff",
      "label": "Digital signature",
      "icon": "pen",
      "description": "A named person must sign before execution continues. No server action — a human closes it.",
      "kind": "MANUAL",
      "params": [
        {"name": "document",   "label": "What is signed", "type": "text", "required": true,
         "placeholder": "Decommission report for SW-07"},
        {"name": "signerRole", "label": "Who may sign",   "type": "enum", "required": true,
         "values": ["Administrator", "NetOps"]},
        {"name": "dueBy",      "label": "Due by",         "type": "text",
         "placeholder": "2026-09-05"},
        {"name": "onRefusal",  "label": "If refused",     "type": "enum", "required": true,
         "values": ["Send back", "Fail the task", "Not allowed"]}
      ],
      "manualTaskConfig": {
        "resultParams": [
          {"name": "signatureRef", "label": "Signature reference", "type": "text", "required": true,
           "placeholder": "SIG-2026-0912"},
          {"name": "note",         "label": "Note",                "type": "text",
           "placeholder": "Also the reason, if you refuse"}
        ],
        "onRefusalDefault": "Send back"
      }
    },
    {
      "name": "archiveDoc",
      "label": "Archive document",
      "icon": "box",
      "description": "Files the signed document. Reads the document id the generate task stored.",
      "kind": "SERVER",
      "params": [
        {"name": "store", "label": "Archive", "type": "text", "required": true,
         "placeholder": "DMS / Change records"}
      ],
      "serverActionConfig": {
        "action": "archiveDocument",
        "inputs": [
          {"target": "documentId", "source": {"kind": "REQUEST_DATA", "path": "documentId"}},
          {"target": "store",      "source": {"kind": "TASK_PARAM",   "path": "store"}}
        ],
        "outputs": [
          {"source": "archiveRef", "target": {"kind": "REQUEST_DATA", "path": "archiveRef"}}
        ]
      }
    }
  ]
};
