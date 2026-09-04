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

   SHAPE — v2: a task type is a PURE FUNCTION with a signature and no
   reference to any request. WHERE its inputs come from and WHERE its outputs
   are stored is decided per use, in the request type's flow — the request
   type is the call site; this catalogue only declares what can be called.
   (v1 carried input/output mappings and configuration params on the task
   itself, which welded every task type to one request type's field names.
   A v1 document is refused rather than half-read.)

     Shared by every task type:
       name, label, icon, description, kind

     kind: "SERVER"
       inputs[]   what the function needs:  {name, label, type, required,
                  placeholder}. Mirrors the server action's parameter list;
                  the labels are what the request designer wires against.
       outputs[]  what it produces: {name, label, type}
       serverActionConfig.action
                  the annotated Groovy/Java the server already exposes — the
                  implementation this signature fronts

     kind: "MANUAL"
       manualTaskConfig
         completeLabel  the verb on the button that closes it
         resultParams[] the FORM the person fills in: {name, label, type,
                        required, placeholder}. Their answers ARE the task's
                        outputs — the request type decides where each one is
                        stored. Types: text, enum, boolean; a boolean answer
                        is what the flow's transitions typically route on.

   THESE FOUR ARE ONE WORKFLOW: a planned-maintenance notification.
   Draft it, approve the exact wording, optionally fingerprint it, then send
   it and record what the mail server said. How they hand work to each other
   is wired in request-types.json.js — nothing here knows about it.
   =========================================================================== */
window.TASK_DEFINITIONS = {
  "apiVersion": "aixboms.taskdefinition/v2",
  "definitions": [
    {
      "name": "draftNotification",
      "label": "Draft notification",
      "icon": "doc",
      "description": "A person writes the customer notification: subject, body and who receives it.",
      "kind": "MANUAL",
      "manualTaskConfig": {
        "completeLabel": "Submit draft",
        "resultParams": [
          {"name": "subject", "label": "Subject", "type": "text", "required": true,
           "placeholder": "Planned maintenance 12.09.2026, 22:00–23:30"},
          {"name": "body", "label": "Message", "type": "text", "required": true,
           "placeholder": "We will replace the uplink switch in rack R12…"},
          {"name": "recipients", "label": "Recipients", "type": "text", "required": true,
           "placeholder": "ops@kunde-a.de, noc@kunde-b.de"}
        ]
      }
    },
    {
      "name": "signNotification",
      "label": "Sign notification",
      "icon": "stamp",
      "description": "Fingerprints a text, so what was approved and what was sent can be proven identical.",
      "kind": "SERVER",
      "inputs": [
        {"name": "text", "label": "Text to sign", "type": "text", "required": true},
        {"name": "signer", "label": "Signed on behalf of", "type": "text", "required": false,
         "placeholder": "AixBOMS Change Management"}
      ],
      "outputs": [
        {"name": "sha256", "label": "Fingerprint (SHA-256)", "type": "text"},
        {"name": "signedAt", "label": "Signed at", "type": "text"}
      ],
      "serverActionConfig": {
        "action": "digitallySign"
      }
    },
    {
      "name": "approveNotification",
      "label": "Approve notification",
      "icon": "pen",
      "description": "An administrator approves the wording before it reaches customers.",
      "kind": "MANUAL",
      "manualTaskConfig": {
        "completeLabel": "Submit decision",
        "resultParams": [
          {"name": "approved", "label": "Approve the wording", "type": "boolean", "required": true},
          {"name": "note", "label": "Comment", "type": "text",
           "placeholder": "Optional — and the reason, if you do not approve"}
        ]
      }
    },
    {
      "name": "sendNotification",
      "label": "Send notification",
      "icon": "mail",
      "description": "Sends a mail to the recipients and records what the mail server answered.",
      "kind": "SERVER",
      "inputs": [
        {"name": "from", "label": "Sender", "type": "text", "required": true,
         "placeholder": "change@aixpertsoft.de"},
        {"name": "to", "label": "To", "type": "text", "required": true},
        {"name": "subject", "label": "Subject", "type": "text", "required": true},
        {"name": "body", "label": "Message", "type": "text", "required": true},
        {"name": "signature", "label": "Signature", "type": "text", "required": false}
      ],
      "outputs": [
        {"name": "status", "label": "Delivery status", "type": "text"},
        {"name": "messageId", "label": "Message id", "type": "text"}
      ],
      "serverActionConfig": {
        "action": "sendMail"
      }
    }
  ]
};
