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
         params = the configuration UI: what the REQUESTER fills in when they
                  add this task to a request.

         Two flags decide how much of that the requester actually gets. Both are
         still set per step in the request type's task flow — they only restrict
         the request-level form:
           readonly  shown, but not editable in the request
           hidden    not shown in the request at all

     kind: "SERVER"  ->  serverActionConfig
         action  = the annotated Groovy/Java the server already exposes
         inputs  = where each of that action's parameters comes from
         outputs = where each of its return values is stored on the request

     kind: "MANUAL"  ->  manualTaskConfig
         resultParams     = what the PERSON supplies to close it
         outputs          = where those answers are stored on the request
         onRefusalDefault = what declining does, unless the task overrides it

   The three input source kinds are the only three there are — LITERAL,
   REQUEST_DATA, TASK_PARAM. Resolution is a dictionary lookup; nothing is
   parsed or evaluated. The dollar-brace form you see in the editor is
   generated from these records for people to read, and never read back.

   THESE FOUR ARE ONE WORKFLOW: a planned-maintenance notification.
   Draft it, fingerprint it, have an administrator approve the exact wording,
   then send it and record what the mail server said. Each step hands the next
   one its work through the request's data.
   =========================================================================== */
window.TASK_DEFINITIONS = {
  "apiVersion": "aixboms.taskdefinition/v1",
  "definitions": [
    {
      "name": "draftNotification",
      "label": "Draft notification",
      "icon": "doc",
      "description": "A person writes the customer notification: subject, body and who receives it.",
      "kind": "MANUAL",
      "params": [],
      "manualTaskConfig": {
        "completeLabel": "Submit draft",
        "resultParams": [
          {"name": "subject", "label": "Subject", "type": "text", "required": true,
           "placeholder": "Planned maintenance 12.09.2026, 22:00–23:30"},
          {"name": "body", "label": "Message", "type": "text", "required": true,
           "placeholder": "We will replace the uplink switch in rack R12…"},
          {"name": "recipients", "label": "Recipients", "type": "text", "required": true,
           "placeholder": "ops@kunde-a.de, noc@kunde-b.de"}
        ],
        "outputs": [
          {"source": "subject",    "target": {"kind": "REQUEST_DATA", "path": "notificationSubject"}},
          {"source": "body",       "target": {"kind": "REQUEST_DATA", "path": "notificationBody"}},
          {"source": "recipients", "target": {"kind": "REQUEST_DATA", "path": "recipients"}}
        ],
        "onRefusalDefault": "Send back"
      }
    },
    {
      "name": "signNotification",
      "label": "Sign notification",
      "icon": "stamp",
      "description": "Fingerprints the exact wording, so what was approved and what was sent can be proven identical.",
      "kind": "SERVER",
      "params": [
        {"name": "signedBy", "label": "Signed on behalf of", "type": "text", "required": true,
         "readonly": true, "placeholder": "AixBOMS Change Management"}
      ],
      "serverActionConfig": {
        "action": "digitallySign",
        "inputs": [
          {"target": "text",   "source": {"kind": "REQUEST_DATA", "path": "notificationBody"}},
          {"target": "signer", "source": {"kind": "TASK_PARAM",   "path": "signedBy"}}
        ],
        "outputs": [
          {"source": "sha256",   "target": {"kind": "REQUEST_DATA", "path": "sha256"}},
          {"source": "signedAt", "target": {"kind": "REQUEST_DATA", "path": "signedAt"}}
        ]
      }
    },
    {
      "name": "approveNotification",
      "label": "Approve notification",
      "icon": "pen",
      "description": "An administrator approves the signed wording before it reaches customers.",
      "kind": "MANUAL",
      "params": [],
      "manualTaskConfig": {
        "completeLabel": "Approve",
        "resultParams": [
          {"name": "note", "label": "Comment", "type": "text",
           "placeholder": "Optional — and the reason, if you decline"}
        ],
        "outputs": [
          {"source": "note", "target": {"kind": "REQUEST_DATA", "path": "approvalNote"}}
        ],
        "onRefusalDefault": "Send back"
      }
    },
    {
      "name": "sendNotification",
      "label": "Send notification",
      "icon": "mail",
      "description": "Sends the approved notification to the recipients and records what the mail server answered.",
      "kind": "SERVER",
      "params": [
        {"name": "fromAddress", "label": "Sender", "type": "text", "required": true,
         "hidden": true, "placeholder": "change@aixpertsoft.de"}
      ],
      "serverActionConfig": {
        "action": "sendMail",
        "inputs": [
          {"target": "from",      "source": {"kind": "TASK_PARAM",   "path": "fromAddress"}},
          {"target": "to",        "source": {"kind": "REQUEST_DATA", "path": "recipients"}},
          {"target": "subject",   "source": {"kind": "REQUEST_DATA", "path": "notificationSubject"}},
          {"target": "body",      "source": {"kind": "REQUEST_DATA", "path": "notificationBody"}},
          {"target": "signature", "source": {"kind": "REQUEST_DATA", "path": "sha256"}}
        ],
        "outputs": [
          {"source": "status",    "target": {"kind": "REQUEST_DATA", "path": "sendStatus"}},
          {"source": "messageId", "target": {"kind": "REQUEST_DATA", "path": "messageId"}}
        ]
      }
    }
  ]
};
