/* ===========================================================================
   Request types — pure data, no logic.

   The document GET /taskrequestdefs would return. Same wrapper trick as
   task-definitions.json.js: a browser opened from file:// may not fetch() a
   sibling .json, and this prototype has to survive being double-clicked.
   Everything after the assignment is strict JSON — quoted keys, no functions.

   SHAPE
     id, name, description   identity
     executionRules          gate the WHOLE run before it starts
     dataParameters          the fields a request carries
     taskFlow                the ACTIVITY GRAPH a new request is created with

     dataParameters[].owner
       AUTHOR     the requester's field. Inside the approval hash, so changing
                  one dismisses sign-off, and frozen while a run is in progress.
       EXECUTION  written by a task's output mapping. Outside the hash — which
                  is why a run does not dismiss its own approvals.

     taskFlow[] — one entry per ACTIVITY. List order is layout order only; the
     execution order is defined by the transitions.
       stepId          stable id; transitions refer to it
       taskDefinition  name from task-definitions.json (absent on a placeholder)
       kind            "PLACEHOLDER" marks a designed slot: at runtime it shows
                       as an "Add task" button, and the requester may fill it with
                       any of its PRECONFIGURED ACTIVITIES — never a raw task
                       type. Each entry carries a label, the task type it uses,
                       its defaults and its own runtimeConfig, so a fill arrives
                       fully configured with one click. Empty = pass-through.
       possibleActivities[]  the slot's menu: {id, label, taskDefinition,
                       defaults, runtimeConfig:{assignedRoles, dueBy, display,
                       requires}}. Configured by the designer, like a flow step.
       start / end     exactly one activity is the start; one or more are ends.
                       A completed end with no matching transition completes
                       the run.
       defaults        pre-filled into the task item at creation

       runtimeConfig — how the ENGINE behaves at this activity. None of it is
       shown to the requester or editable by them; all of it is inside the
       approval hash, because what an approver approved includes how the
       process routes.
         assignedRoles   who may carry out a manual step — anyone holding one
                         of these roles. Empty falls back to Administrator.
         dueBy           when the step is due, shown on the work item
         requires        TaskRule[] — if not satisfied, the run parks on a
                         blocker. These cannot be executionRules: the value may
                         be produced by an earlier activity.
         display         which request-data fields the completion dialog shows
                         the person, by name. Empty-valued fields are omitted,
                         so the draft can list approvalNote and show it only on
                         a redo after a rejection. Presentation only — it is
                         deliberately NOT part of the approval hash.
         transitions     the outgoing edges, evaluated IN ORDER after the
                         activity completes; first match wins.
                           {"when": null, "to": "sX"}          always fires
                           {"when": {"path": "approved",       fires when the
                                     "equals": false},          request-data
                            "to": "s1"}                         field equals
                         A condition is one structured equality against request
                         data (boolean or string). No expressions — the same
                         doctrine as everywhere else in this design.

   The flow is a SINGLE-TOKEN STATE MACHINE. Conditional routing and loops are
   in; parallelism, fork/join, sub-processes and timers are out. That is the
   line between this subsystem and de.comconsult.wf, and it is meant to hold.

   FUTURE SAFETY
     - apiVersion is checked on load; unknown majors are refused, not guessed
       at. v2 introduced transitions/start/end and removed onRefusal, skipWhen
       and onError; v3 replaced a placeholder's raw possibleTasks with
       preconfigured possibleActivities. Older documents are refused rather
       than half-read.
     - Everything is a named key; references are by name, never by index.
     - Every union carries an explicit discriminator: rules have `kind`,
       parameters have `owner` and `type`, placeholder activities have
       `kind: "PLACEHOLDER"`. Nothing is inferred from shape.
     - Unknown fields are preserved across an import/export round-trip.
   =========================================================================== */
window.REQUEST_TYPES = {
  "apiVersion": "aixboms.requesttype/v3",
  "requestTypes": [
    {
      "id": "maintenance-notification",
      "name": "Maintenance Notification",
      "description": "Tell affected customers about planned maintenance, with proof of exactly what was sent and who approved it.",

      "executionRules": [
        {"kind": "approvals", "min": 1, "roles": ["Administrator"], "excludeRequester": true},
        {"kind": "noUnresolvedChangeRequests"}
      ],

      "dataParameters": [
        {"name": "window", "label": "Maintenance window", "type": "text", "owner": "AUTHOR",
         "defaultValue": "12.09.2026, 22:00–23:30 CEST"},
        {"name": "affected", "label": "Affected system", "type": "text", "owner": "AUTHOR",
         "defaultValue": "Rack R12 — uplink switch SW-01"},
        {"name": "skipApproval", "label": "Skip the approval step", "type": "boolean", "owner": "AUTHOR",
         "defaultValue": false},

        {"name": "notificationSubject", "label": "Notification subject", "type": "text", "owner": "EXECUTION",
         "defaultValue": ""},
        {"name": "notificationBody", "label": "Notification text", "type": "text", "owner": "EXECUTION",
         "defaultValue": ""},
        {"name": "recipients", "label": "Recipients", "type": "text", "owner": "EXECUTION",
         "defaultValue": ""},
        {"name": "sha256", "label": "Fingerprint (SHA-256)", "type": "text", "owner": "EXECUTION",
         "defaultValue": ""},
        {"name": "signedAt", "label": "Signed at", "type": "text", "owner": "EXECUTION",
         "defaultValue": ""},
        {"name": "approved", "label": "Wording approved", "type": "boolean", "owner": "EXECUTION",
         "defaultValue": false},
        {"name": "approvalNote", "label": "Approver comment", "type": "text", "owner": "EXECUTION",
         "defaultValue": ""},
        {"name": "sendStatus", "label": "Delivery status", "type": "text", "owner": "EXECUTION",
         "defaultValue": ""},
        {"name": "messageId", "label": "Message id", "type": "text", "owner": "EXECUTION",
         "defaultValue": ""}
      ],

      "taskFlow": [
        {
          "stepId": "s1",
          "taskDefinition": "draftNotification",
          "start": true,
          "end": false,
          "defaults": {},
          "runtimeConfig": {
            "assignedRoles": ["NetOps"],
            "dueBy": "11.09.2026",
            "display": ["approvalNote"],
            "requires": [],
            "transitions": [
              {"when": {"path": "skipApproval", "equals": true}, "to": "p1"},
              {"when": null, "to": "s3"}
            ]
          }
        },
        {
          "stepId": "s3",
          "taskDefinition": "approveNotification",
          "start": false,
          "end": false,
          "defaults": {},
          "runtimeConfig": {
            "assignedRoles": ["Administrator"],
            "dueBy": "12.09.2026",
            "display": ["notificationSubject", "notificationBody", "recipients"],
            "requires": [],
            "transitions": [
              {"when": {"path": "approved", "equals": false}, "to": "s1"},
              {"when": null, "to": "p1"}
            ]
          }
        },
        {
          "stepId": "p1",
          "kind": "PLACEHOLDER",
          "label": "Additional steps",
          "possibleActivities": [
            {
              "id": "a1",
              "label": "Digital signature",
              "taskDefinition": "signNotification",
              "defaults": {"signedBy": "AixBOMS Change Management"},
              "runtimeConfig": {"assignedRoles": [], "dueBy": null, "display": [], "requires": []}
            },
            {
              "id": "a2",
              "label": "Second approval",
              "taskDefinition": "approveNotification",
              "defaults": {},
              "runtimeConfig": {"assignedRoles": ["Administrator"], "dueBy": null,
                "display": ["notificationSubject", "notificationBody", "recipients"], "requires": []}
            }
          ],
          "start": false,
          "end": false,
          "runtimeConfig": {
            "assignedRoles": [],
            "dueBy": null,
            "display": [],
            "requires": [],
            "transitions": [
              {"when": null, "to": "s4"}
            ]
          }
        },
        {
          "stepId": "s4",
          "taskDefinition": "sendNotification",
          "start": false,
          "end": true,
          "defaults": {"fromAddress": "change@aixpertsoft.de"},
          "runtimeConfig": {
            "assignedRoles": [],
            "dueBy": null,
            "display": [],
            "requires": [],
            "transitions": []
          }
        }
      ]
    }
  ]
};
