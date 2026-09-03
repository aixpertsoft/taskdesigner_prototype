/* ===========================================================================
   Request types — pure data, no logic.

   The document GET /taskrequestdefs would return. Same wrapper trick as
   task-definitions.json.js: a browser opened from file:// may not fetch() a
   sibling .json, and this prototype has to survive being double-clicked.
   Everything after the assignment is strict JSON — quoted keys, no functions.

   SHAPE
     id, name, description   identity
     onError                 STOP | CONTINUE, when a task fails mid-run
     executionRules          gate the WHOLE run before it starts
     dataParameters          the fields a request carries
     taskFlow                the ordered steps a new request is created with

     dataParameters[].owner
       AUTHOR     the requester's field. Inside the approval hash, so changing
                  one dismisses sign-off, and frozen while a run is in progress.
       EXECUTION  written by a task's output mapping. Outside the hash — which
                  is why a run does not dismiss its own approvals.

     taskFlow[]
       AUTHORING — what the requester gets, and what they may change
         stepId          stable id, so a step survives being reordered
         taskDefinition  name from task-definitions.json
         required        the requester may not remove this step
         defaults        pre-filled into the task item at creation

       runtimeConfig — how the ENGINE behaves at this step. None of it is shown
       to the requester or editable by them; all of it is inside the approval
       hash, because what an approver approved includes how the step behaves.
         onRefusal       what declining does: "Send back" (default), "Fail the
                         task", or "Not allowed". null falls back to the task
                         type's own onRefusalDefault.
         skipWhen        TaskRule[] — if satisfied when the run arrives, the step
                         is marked SKIPPED and the run carries on
         requires        TaskRule[] — if not satisfied, the run parks on a blocker.
                         These cannot be executionRules: the value they need may
                         be produced by an earlier step, so they are only knowable
                         at run time.

   The flow is LINEAR by design. Steps run in order and a step may be skipped;
   there is no branching, no parallelism and no loops. That is the line between
   this subsystem and de.comconsult.wf, and it is meant to hold.

   FUTURE SAFETY
     - apiVersion is checked on load; unknown majors are refused, not guessed at.
     - Everything is a named key. No positional arrays, no tuples, no ordering
       significance except taskFlow itself, which is ordered on purpose.
     - Every union carries an explicit discriminator: rules have `kind`, data
       parameters have `owner` and `type`. Nothing is inferred from shape.
     - References are by name (`taskDefinition`, `path`, `roles`), never by index.
     - Unknown fields are preserved across an import/export round-trip, so a
       newer file edited by an older client does not silently lose data.
   =========================================================================== */
window.REQUEST_TYPES = {
  "apiVersion": "aixboms.requesttype/v1",
  "requestTypes": [
    {
      "id": "maintenance-notification",
      "name": "Maintenance Notification",
      "description": "Tell affected customers about planned maintenance, with proof of exactly what was sent and who approved it.",
      "onError": "STOP",

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
          "required": true,
          "defaults": {"assignedRole": "NetOps", "dueBy": "11.09.2026"},
          "runtimeConfig": {
            "onRefusal": "Send back",
            "skipWhen": [],
            "requires": []
          }
        },
        {
          "stepId": "s2",
          "taskDefinition": "signNotification",
          "required": true,
          "defaults": {"signedBy": "AixBOMS Change Management"},
          "runtimeConfig": {
            "onRefusal": null,
            "skipWhen": [],
            "requires": []
          }
        },
        {
          "stepId": "s3",
          "taskDefinition": "approveNotification",
          "required": false,
          "defaults": {"assignedRole": "Administrator", "dueBy": "12.09.2026"},
          "runtimeConfig": {
            "onRefusal": "Send back",
            "skipWhen": [{"kind": "data", "path": "skipApproval", "op": "truthy"}],
            "requires": []
          }
        },
        {
          "stepId": "s4",
          "taskDefinition": "sendNotification",
          "required": true,
          "defaults": {"fromAddress": "change@aixpertsoft.de"},
          "runtimeConfig": {
            "onRefusal": null,
            "skipWhen": [],
            "requires": [{"kind": "data", "path": "sha256", "op": "truthy"}]
          }
        }
      ]
    }
  ]
};
