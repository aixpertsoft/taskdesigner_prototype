/* ===========================================================================
   Request types — pure data, no logic.

   The document GET /taskrequestdefs would return. Same wrapper trick as
   task-definitions.json.js: a browser opened from file:// may not fetch() a
   sibling .json, and this prototype has to survive being double-clicked.
   Everything after the assignment is strict JSON — quoted keys, no functions.

   SHAPE
     id, name, description   identity
     dataParameters          the fields a request carries
     taskFlow                the ACTIVITY GRAPH a new request is created with

     dataParameters[].owner
       AUTHOR     the requester's field. Inside the approval hash, so changing
                  one dismisses sign-off, and frozen while a run is in progress.
       EXECUTION  written by a task through an output binding. Outside the hash
                  — which is why a run does not dismiss its own approvals.

     dataParameters[].internal
       Presentation only: the field stays off the request's Data tab and shows
       instead in its read-only "Internal fields" section — plumbing the run
       writes (a fingerprint, a message id) that a requester never edits.
       Work-item forms, blockers and a step's "Shown to the person" list are
       unaffected. Absent = visible.

     dataParameters[].requiredAtCreation
       The "start form": the New-request dialog demands this field and creation
       is refused without it — data the process cannot exist without never
       needs a work item to chase it. Valid on either owner:
         on a requester-owned field it is simply mandatory author data;
         on a task-written field it seeds the STARTING value — the requester
         provides it at creation, and tasks may refine it later through their
         output bindings (their forms arrive prefilled with the current value).

     taskFlow[] — one entry per ACTIVITY. List order is layout order only; the
     execution order is defined by the transitions.
       stepId          stable id; transitions refer to it
       taskDefinition  name from task-definitions.json (absent on a placeholder)
       kind            "PLACEHOLDER" marks a designed slot: at runtime it shows
                       as an "Add task" button, and the requester may fill it with
                       any of its PRECONFIGURED ACTIVITIES — never a raw task
                       type. Each entry is wired exactly like a flow step, so a
                       fill arrives fully configured with one click.
                       Empty = pass-through.
       possibleActivities[]  the slot's menu: {id, label, taskDefinition,
                       inputBindings, outputBindings, runtimeConfig:{
                       assignedRoles, dueBy, display}}.
       start / end     exactly one activity is the start; one or more are ends.
                       A completed end with no matching transition completes
                       the run.

       inputBindings — THE WIRING (v4). A task type is a pure function: it
       declares inputs and outputs but has no idea where they live. This is
       the call site — one entry per declared input of the task type:
         {"kind": "LITERAL",      "value": "…"}   a fixed value, set here
         {"kind": "REQUEST_DATA", "path": "…"}    read from a request field
       Those are the only two kinds. Resolution is a dictionary lookup;
       nothing is parsed or evaluated. An earlier activity hands work to a
       later one only THROUGH the request's data — never by direct reference,
       because slots and loops mean the author cannot know which task items a
       plan will hold. The request is the bus.

       outputBindings — one entry per declared output the process wants kept:
         {"kind": "REQUEST_DATA", "path": "…"}    stored on a request field
       Outputs without an entry are simply not stored. Targets should be
       EXECUTION-owned fields — that keeps a run from moving its own hash.

       runtimeConfig — how the ENGINE behaves at this activity. None of it is
       shown to the requester or editable by them; all of it is inside the
       approval hash, because what an approver approved includes how the
       process routes.
         assignedRoles   who may carry out a manual step — anyone holding one
                         of these roles. Empty falls back to Administrator.
         dueBy           when the step is due, shown on the work item
         display         which request-data fields the step's work-item form
                         shows the person (its "From the request" box), by name. Empty-valued fields are omitted,
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
       at. v2 introduced transitions/start/end; v3 replaced a placeholder's raw
       possibleTasks with preconfigured possibleActivities; v4 moved ALL data
       wiring here from the task definitions — `defaults` became inputBindings,
       and output storage became outputBindings; v5 removed executionRules and
       the pre-execution approval gate — WHO may execute is deferred to user
       permissions, and approval, where a process needs one, is an ACTIVITY in
       the flow (see approveNotification); v6 removed a step's `requires`
       preconditions — the only run-time pause rule left is the one that needs
       no configuration: a required input that resolves to nothing parks the
       run on a blocker, by the action's own contract. Older documents are
       refused rather than half-read.
     - Everything is a named key; references are by name, never by index.
     - Every union carries an explicit discriminator: rules have `kind`,
       parameters have `owner` and `type`, bindings have `kind`, placeholder
       activities have `kind: "PLACEHOLDER"`. Nothing is inferred from shape.
     - Unknown fields are preserved across an import/export round-trip.
   =========================================================================== */
window.REQUEST_TYPES = {
  "apiVersion": "aixboms.requesttype/v6",
  "requestTypes": [
    {
      "id": "maintenance-notification",
      "name": "Maintenance Notification",
      "description": "Tell affected customers about planned maintenance, with proof of exactly what was sent and who approved it.",

      "dataParameters": [
        {"name": "window", "label": "Maintenance window", "type": "text", "owner": "AUTHOR",
         "defaultValue": "12.09.2026, 22:00–23:30 CEST"},
        {"name": "affected", "label": "Affected system", "type": "text", "owner": "AUTHOR",
         "defaultValue": "Rack R12 — uplink switch SW-01"},
        {"name": "skipApproval", "label": "Skip the approval step", "type": "boolean", "owner": "AUTHOR",
         "defaultValue": false},

        {"name": "notificationSubject", "label": "Notification subject", "type": "text", "owner": "EXECUTION",
         "requiredAtCreation": true, "defaultValue": ""},
        {"name": "notificationBody", "label": "Notification text", "type": "text", "owner": "EXECUTION",
         "defaultValue": ""},
        {"name": "recipients", "label": "Recipients", "type": "text", "owner": "EXECUTION",
         "defaultValue": ""},
        {"name": "sha256", "label": "Fingerprint (SHA-256)", "type": "text", "owner": "EXECUTION",
         "internal": true, "defaultValue": ""},
        {"name": "signedAt", "label": "Signed at", "type": "text", "owner": "EXECUTION",
         "internal": true, "defaultValue": ""},
        {"name": "approved", "label": "Wording approved", "type": "boolean", "owner": "EXECUTION",
         "defaultValue": false},
        {"name": "approvalNote", "label": "Approver comment", "type": "text", "owner": "EXECUTION",
         "defaultValue": ""},
        {"name": "sendStatus", "label": "Delivery status", "type": "text", "owner": "EXECUTION",
         "defaultValue": ""},
        {"name": "messageId", "label": "Message id", "type": "text", "owner": "EXECUTION",
         "internal": true, "defaultValue": ""}
      ],

      "taskFlow": [
        {
          "stepId": "s1",
          "taskDefinition": "draftNotification",
          "start": true,
          "end": false,
          "inputBindings": {},
          "outputBindings": {
            "subject":    {"kind": "REQUEST_DATA", "path": "notificationSubject"},
            "body":       {"kind": "REQUEST_DATA", "path": "notificationBody"},
            "recipients": {"kind": "REQUEST_DATA", "path": "recipients"}
          },
          "runtimeConfig": {
            "assignedRoles": ["NetOps"],
            "dueBy": "11.09.2026",
            "display": ["approvalNote"],
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
          "inputBindings": {},
          "outputBindings": {
            "approved": {"kind": "REQUEST_DATA", "path": "approved"},
            "note":     {"kind": "REQUEST_DATA", "path": "approvalNote"}
          },
          "runtimeConfig": {
            "assignedRoles": ["Administrator"],
            "dueBy": "12.09.2026",
            "display": ["notificationSubject", "notificationBody", "recipients"],
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
              "inputBindings": {
                "text":   {"kind": "REQUEST_DATA", "path": "notificationBody"},
                "signer": {"kind": "LITERAL", "value": "AixBOMS Change Management"}
              },
              "outputBindings": {
                "sha256":   {"kind": "REQUEST_DATA", "path": "sha256"},
                "signedAt": {"kind": "REQUEST_DATA", "path": "signedAt"}
              },
              "runtimeConfig": {"assignedRoles": [], "dueBy": null, "display": []}
            },
            {
              "id": "a2",
              "label": "Second approval",
              "taskDefinition": "approveNotification",
              "inputBindings": {},
              "outputBindings": {
                "approved": {"kind": "REQUEST_DATA", "path": "approved"},
                "note":     {"kind": "REQUEST_DATA", "path": "approvalNote"}
              },
              "runtimeConfig": {"assignedRoles": ["Administrator"], "dueBy": null,
                "display": ["notificationSubject", "notificationBody", "recipients"]}
            }
          ],
          "start": false,
          "end": false,
          "runtimeConfig": {
            "assignedRoles": [],
            "dueBy": null,
            "display": [],
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
          "inputBindings": {
            "from":      {"kind": "LITERAL", "value": "change@aixpertsoft.de"},
            "to":        {"kind": "REQUEST_DATA", "path": "recipients"},
            "subject":   {"kind": "REQUEST_DATA", "path": "notificationSubject"},
            "body":      {"kind": "REQUEST_DATA", "path": "notificationBody"},
            "signature": {"kind": "REQUEST_DATA", "path": "sha256"}
          },
          "outputBindings": {
            "status":    {"kind": "REQUEST_DATA", "path": "sendStatus"},
            "messageId": {"kind": "REQUEST_DATA", "path": "messageId"}
          },
          "runtimeConfig": {
            "assignedRoles": [],
            "dueBy": null,
            "display": [],
            "transitions": []
          }
        }
      ]
    }
  ]
};
