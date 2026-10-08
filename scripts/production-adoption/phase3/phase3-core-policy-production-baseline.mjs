// Independently adjudicated historical input. ACLs are preservation-only security debt.
function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export const CORE_POLICY_PRODUCTION_BASELINE = freeze({
  "format": "REFLAB_64245_APPROVED_PRODUCTION_BASELINE_V1",
  "version": 1,
  "projectRef": "nagjddldrldwavmfaytc",
  "migrationSha": "839ce75ab6961d1bcc304957e571aebe669b33473089dd95d4e1a03285f80ee1",
  "sharedContractSha": "b02ab74d043fd5cc91bf99f7c28b11bfafdae6f90d522df97ada6d6037bb13bd",
  "provenance": {
    "source": "completed Production READ-ONLY forensic",
    "forensicFormat": "REFLAB_64245_PRODUCTION_BASELINE_FORENSIC_V1",
    "forensicFileSha256": "4850f01f6043b32be74dd9f9b9f221b89158cb6654989f9a9bc70611912cc98f",
    "forensicApproval": "NOT_PERFORMED",
    "approvalScope": "64245 PRE transition only",
    "adjudication": "64245_POLICY_RECONCILIATION_COMPATIBLE",
    "reviewedCandidateHead": "d2e98c2cc836b068ef88679feb48ff0f724b2278"
  },
  "tableAclSecurityStatus": "PENDING_RECONCILIATION",
  "tableAclBaselinePurpose": "PRESERVATION_ONLY",
  "tableAclReconciliationRequired": true,
  "tables": [
    {
      "schema": "public",
      "table": "attempts",
      "owner": "postgres",
      "rls": true,
      "force": false,
      "installer_authority": true
    },
    {
      "schema": "public",
      "table": "exam_results",
      "owner": "postgres",
      "rls": true,
      "force": false,
      "installer_authority": true
    },
    {
      "schema": "public",
      "table": "match_preparations",
      "owner": "postgres",
      "rls": true,
      "force": false,
      "installer_authority": true
    },
    {
      "schema": "public",
      "table": "notification_events",
      "owner": "postgres",
      "rls": true,
      "force": false,
      "installer_authority": true
    },
    {
      "schema": "public",
      "table": "post_match_reviews",
      "owner": "postgres",
      "rls": true,
      "force": false,
      "installer_authority": true
    },
    {
      "schema": "public",
      "table": "psychology_checkins",
      "owner": "postgres",
      "rls": true,
      "force": false,
      "installer_authority": true
    },
    {
      "schema": "public",
      "table": "psychology_exercise_sessions",
      "owner": "postgres",
      "rls": true,
      "force": false,
      "installer_authority": true
    },
    {
      "schema": "public",
      "table": "psychology_wellbeing_assessments",
      "owner": "postgres",
      "rls": true,
      "force": false,
      "installer_authority": true
    },
    {
      "schema": "public",
      "table": "rules_exam_results",
      "owner": "postgres",
      "rls": true,
      "force": false,
      "installer_authority": true
    },
    {
      "schema": "public",
      "table": "user_profiles",
      "owner": "postgres",
      "rls": true,
      "force": false,
      "installer_authority": true
    }
  ],
  "targetSlots": [
    {
      "schema": "public",
      "table": "user_profiles",
      "name": "user_profiles_own_read",
      "command": "SELECT",
      "presence": "PRESENT",
      "policy": {
        "oid": "21727",
        "schema": "public",
        "table": "user_profiles",
        "name": "user_profiles_own_read",
        "command": "SELECT",
        "permissive": true,
        "roles": [
          "authenticated"
        ],
        "using": "((user_id = platform_request_user_id()) OR platform_is_super_admin())",
        "withCheck": null
      }
    },
    {
      "schema": "public",
      "table": "user_profiles",
      "name": "user_profiles_own_insert",
      "command": "INSERT",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "user_profiles",
      "name": "user_profiles_own_update",
      "command": "UPDATE",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "match_preparations",
      "name": "match_preparations_own_read",
      "command": "SELECT",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "match_preparations",
      "name": "match_preparations_own_insert",
      "command": "INSERT",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "match_preparations",
      "name": "match_preparations_own_update",
      "command": "UPDATE",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "post_match_reviews",
      "name": "post_match_reviews_own_read",
      "command": "SELECT",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "post_match_reviews",
      "name": "post_match_reviews_own_insert",
      "command": "INSERT",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "post_match_reviews",
      "name": "post_match_reviews_own_update",
      "command": "UPDATE",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "psychology_checkins",
      "name": "psychology_checkins_own_read",
      "command": "SELECT",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "psychology_checkins",
      "name": "psychology_checkins_own_insert",
      "command": "INSERT",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "psychology_checkins",
      "name": "psychology_checkins_own_update",
      "command": "UPDATE",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "psychology_wellbeing_assessments",
      "name": "psychology_wellbeing_assessments_own_read",
      "command": "SELECT",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "psychology_wellbeing_assessments",
      "name": "psychology_wellbeing_assessments_own_insert",
      "command": "INSERT",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "psychology_wellbeing_assessments",
      "name": "psychology_wellbeing_assessments_own_update",
      "command": "UPDATE",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "psychology_exercise_sessions",
      "name": "psychology_exercise_sessions_own_read",
      "command": "SELECT",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "psychology_exercise_sessions",
      "name": "psychology_exercise_sessions_own_insert",
      "command": "INSERT",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "psychology_exercise_sessions",
      "name": "psychology_exercise_sessions_own_update",
      "command": "UPDATE",
      "presence": "MISSING",
      "policy": null
    },
    {
      "schema": "public",
      "table": "attempts",
      "name": "attempts_own_read",
      "command": "SELECT",
      "presence": "PRESENT",
      "policy": {
        "oid": "21729",
        "schema": "public",
        "table": "attempts",
        "name": "attempts_own_read",
        "command": "SELECT",
        "permissive": true,
        "roles": [
          "authenticated"
        ],
        "using": "((user_id = platform_request_user_id()) OR platform_is_super_admin())",
        "withCheck": null
      }
    },
    {
      "schema": "public",
      "table": "exam_results",
      "name": "exam_results_own_read",
      "command": "SELECT",
      "presence": "PRESENT",
      "policy": {
        "oid": "21731",
        "schema": "public",
        "table": "exam_results",
        "name": "exam_results_own_read",
        "command": "SELECT",
        "permissive": true,
        "roles": [
          "authenticated"
        ],
        "using": "((user_id = platform_request_user_id()) OR platform_is_super_admin())",
        "withCheck": null
      }
    },
    {
      "schema": "public",
      "table": "rules_exam_results",
      "name": "rules_exam_results_own_read",
      "command": "SELECT",
      "presence": "PRESENT",
      "policy": {
        "oid": "21733",
        "schema": "public",
        "table": "rules_exam_results",
        "name": "rules_exam_results_own_read",
        "command": "SELECT",
        "permissive": true,
        "roles": [
          "authenticated"
        ],
        "using": "((user_id = platform_request_user_id()) OR platform_is_super_admin())",
        "withCheck": null
      }
    },
    {
      "schema": "public",
      "table": "notification_events",
      "name": "notification_events_own_read",
      "command": "SELECT",
      "presence": "MISSING",
      "policy": null
    }
  ],
  "legacyPolicies": [
    {
      "oid": "18669",
      "schema": "public",
      "table": "notification_events",
      "name": "Users can read own notification events",
      "command": "SELECT",
      "permissive": true,
      "roles": [
        "authenticated"
      ],
      "using": "(user_id = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text))",
      "withCheck": null
    },
    {
      "oid": "19554",
      "schema": "public",
      "table": "match_preparations",
      "name": "match_preparations_authenticated_manage_own",
      "command": "ALL",
      "permissive": true,
      "roles": [
        "authenticated"
      ],
      "using": "(user_id = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text))",
      "withCheck": "(user_id = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text))"
    },
    {
      "oid": "19555",
      "schema": "public",
      "table": "post_match_reviews",
      "name": "post_match_reviews_authenticated_manage_own",
      "command": "ALL",
      "permissive": true,
      "roles": [
        "authenticated"
      ],
      "using": "(user_id = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text))",
      "withCheck": "(user_id = COALESCE((auth.jwt() ->> 'sub'::text), (auth.uid())::text))"
    }
  ],
  "preservedPolicies": [
    {
      "oid": "18672",
      "schema": "public",
      "table": "notification_events",
      "name": "Service role manages notification events",
      "command": "ALL",
      "permissive": true,
      "roles": [
        "service_role"
      ],
      "using": "true",
      "withCheck": "true"
    },
    {
      "oid": "19570",
      "schema": "public",
      "table": "match_preparations",
      "name": "match_preparations_service_role_all",
      "command": "ALL",
      "permissive": true,
      "roles": [
        "service_role"
      ],
      "using": "true",
      "withCheck": "true"
    },
    {
      "oid": "19571",
      "schema": "public",
      "table": "post_match_reviews",
      "name": "post_match_reviews_service_role_all",
      "command": "ALL",
      "permissive": true,
      "roles": [
        "service_role"
      ],
      "using": "true",
      "withCheck": "true"
    },
    {
      "oid": "21730",
      "schema": "public",
      "table": "attempts",
      "name": "attempts_own_insert",
      "command": "INSERT",
      "permissive": true,
      "roles": [
        "authenticated"
      ],
      "using": null,
      "withCheck": "(user_id = platform_request_user_id())"
    },
    {
      "oid": "21732",
      "schema": "public",
      "table": "exam_results",
      "name": "exam_results_own_insert",
      "command": "INSERT",
      "permissive": true,
      "roles": [
        "authenticated"
      ],
      "using": null,
      "withCheck": "(user_id = platform_request_user_id())"
    },
    {
      "oid": "21734",
      "schema": "public",
      "table": "rules_exam_results",
      "name": "rules_exam_results_own_insert",
      "command": "INSERT",
      "permissive": true,
      "roles": [
        "authenticated"
      ],
      "using": null,
      "withCheck": "(user_id = platform_request_user_id())"
    },
    {
      "oid": "22365",
      "schema": "public",
      "table": "attempts",
      "name": "reflab_preflight_audit_owner_read",
      "command": "SELECT",
      "permissive": true,
      "roles": [
        "reflab_preflight_audit_owner"
      ],
      "using": "true",
      "withCheck": null
    },
    {
      "oid": "22370",
      "schema": "public",
      "table": "exam_results",
      "name": "reflab_preflight_audit_owner_read",
      "command": "SELECT",
      "permissive": true,
      "roles": [
        "reflab_preflight_audit_owner"
      ],
      "using": "true",
      "withCheck": null
    },
    {
      "oid": "22398",
      "schema": "public",
      "table": "match_preparations",
      "name": "reflab_preflight_audit_owner_read",
      "command": "SELECT",
      "permissive": true,
      "roles": [
        "reflab_preflight_audit_owner"
      ],
      "using": "true",
      "withCheck": null
    },
    {
      "oid": "22399",
      "schema": "public",
      "table": "notification_events",
      "name": "reflab_preflight_audit_owner_read",
      "command": "SELECT",
      "permissive": true,
      "roles": [
        "reflab_preflight_audit_owner"
      ],
      "using": "true",
      "withCheck": null
    },
    {
      "oid": "22406",
      "schema": "public",
      "table": "post_match_reviews",
      "name": "reflab_preflight_audit_owner_read",
      "command": "SELECT",
      "permissive": true,
      "roles": [
        "reflab_preflight_audit_owner"
      ],
      "using": "true",
      "withCheck": null
    },
    {
      "oid": "22407",
      "schema": "public",
      "table": "psychology_checkins",
      "name": "reflab_preflight_audit_owner_read",
      "command": "SELECT",
      "permissive": true,
      "roles": [
        "reflab_preflight_audit_owner"
      ],
      "using": "true",
      "withCheck": null
    },
    {
      "oid": "22408",
      "schema": "public",
      "table": "psychology_exercise_sessions",
      "name": "reflab_preflight_audit_owner_read",
      "command": "SELECT",
      "permissive": true,
      "roles": [
        "reflab_preflight_audit_owner"
      ],
      "using": "true",
      "withCheck": null
    },
    {
      "oid": "22409",
      "schema": "public",
      "table": "psychology_wellbeing_assessments",
      "name": "reflab_preflight_audit_owner_read",
      "command": "SELECT",
      "permissive": true,
      "roles": [
        "reflab_preflight_audit_owner"
      ],
      "using": "true",
      "withCheck": null
    },
    {
      "oid": "22413",
      "schema": "public",
      "table": "rules_exam_results",
      "name": "reflab_preflight_audit_owner_read",
      "command": "SELECT",
      "permissive": true,
      "roles": [
        "reflab_preflight_audit_owner"
      ],
      "using": "true",
      "withCheck": null
    },
    {
      "oid": "22415",
      "schema": "public",
      "table": "user_profiles",
      "name": "reflab_preflight_audit_owner_read",
      "command": "SELECT",
      "permissive": true,
      "roles": [
        "reflab_preflight_audit_owner"
      ],
      "using": "true",
      "withCheck": null
    },
    {
      "oid": "22451",
      "schema": "public",
      "table": "user_profiles",
      "name": "user_profiles_admin_mutation_target_read",
      "command": "SELECT",
      "permissive": true,
      "roles": [
        "reflab_rls_owner"
      ],
      "using": "(user_id = current_setting('reflab.admin_target_user_id'::text, true))",
      "withCheck": null
    },
    {
      "oid": "22497",
      "schema": "public",
      "table": "user_profiles",
      "name": "training_attempt_profile_read",
      "command": "SELECT",
      "permissive": true,
      "roles": [
        "reflab_rls_owner"
      ],
      "using": "(user_id = current_setting('reflab.training_user_id'::text, true))",
      "withCheck": null
    },
    {
      "oid": "22509",
      "schema": "public",
      "table": "attempts",
      "name": "training_attempt_existing_read",
      "command": "SELECT",
      "permissive": true,
      "roles": [
        "reflab_rls_owner"
      ],
      "using": "(user_id = current_setting('reflab.training_user_id'::text, true))",
      "withCheck": null
    },
    {
      "oid": "22510",
      "schema": "public",
      "table": "attempts",
      "name": "training_attempt_insert",
      "command": "INSERT",
      "permissive": true,
      "roles": [
        "reflab_rls_owner"
      ],
      "using": null,
      "withCheck": "((user_id = current_setting('reflab.training_user_id'::text, true)) AND ((submission_id)::text = current_setting('reflab.training_submission_id'::text, true)) AND (canonical_payload_hash = current_setting('reflab.training_payload_hash'::text, true)) AND (exam_result_id IS NULL) AND (institution_id IS NULL) AND (institution_group_id IS NULL) AND (institution_assessment_session_id IS NULL))"
    }
  ],
  "tableAcl": [
    {
      "table": "attempts",
      "grantee": "authenticated",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "attempts",
      "grantee": "postgres",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "attempts",
      "grantee": "reflab_prod_preflight_ro",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "SELECT"
      ]
    },
    {
      "table": "attempts",
      "grantee": "reflab_rls_owner",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "INSERT",
        "SELECT"
      ]
    },
    {
      "table": "attempts",
      "grantee": "service_role",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "exam_results",
      "grantee": "authenticated",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "exam_results",
      "grantee": "postgres",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "exam_results",
      "grantee": "reflab_prod_preflight_ro",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "SELECT"
      ]
    },
    {
      "table": "exam_results",
      "grantee": "service_role",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "match_preparations",
      "grantee": "anon",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "match_preparations",
      "grantee": "authenticated",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "match_preparations",
      "grantee": "postgres",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "match_preparations",
      "grantee": "reflab_prod_preflight_ro",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "SELECT"
      ]
    },
    {
      "table": "match_preparations",
      "grantee": "service_role",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "notification_events",
      "grantee": "anon",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "notification_events",
      "grantee": "authenticated",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "notification_events",
      "grantee": "postgres",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "notification_events",
      "grantee": "reflab_prod_preflight_ro",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "SELECT"
      ]
    },
    {
      "table": "notification_events",
      "grantee": "service_role",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "post_match_reviews",
      "grantee": "anon",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "post_match_reviews",
      "grantee": "authenticated",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "post_match_reviews",
      "grantee": "postgres",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "post_match_reviews",
      "grantee": "reflab_prod_preflight_ro",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "SELECT"
      ]
    },
    {
      "table": "post_match_reviews",
      "grantee": "service_role",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "psychology_checkins",
      "grantee": "anon",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "psychology_checkins",
      "grantee": "authenticated",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "psychology_checkins",
      "grantee": "postgres",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "psychology_checkins",
      "grantee": "reflab_prod_preflight_ro",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "SELECT"
      ]
    },
    {
      "table": "psychology_checkins",
      "grantee": "service_role",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "psychology_exercise_sessions",
      "grantee": "anon",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "psychology_exercise_sessions",
      "grantee": "authenticated",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "psychology_exercise_sessions",
      "grantee": "postgres",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "psychology_exercise_sessions",
      "grantee": "reflab_prod_preflight_ro",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "SELECT"
      ]
    },
    {
      "table": "psychology_exercise_sessions",
      "grantee": "service_role",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "psychology_wellbeing_assessments",
      "grantee": "anon",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "psychology_wellbeing_assessments",
      "grantee": "authenticated",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "psychology_wellbeing_assessments",
      "grantee": "postgres",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "psychology_wellbeing_assessments",
      "grantee": "reflab_prod_preflight_ro",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "SELECT"
      ]
    },
    {
      "table": "psychology_wellbeing_assessments",
      "grantee": "service_role",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "rules_exam_results",
      "grantee": "authenticated",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "rules_exam_results",
      "grantee": "postgres",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "rules_exam_results",
      "grantee": "reflab_prod_preflight_ro",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "SELECT"
      ]
    },
    {
      "table": "rules_exam_results",
      "grantee": "service_role",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "user_profiles",
      "grantee": "authenticated",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "user_profiles",
      "grantee": "postgres",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    },
    {
      "table": "user_profiles",
      "grantee": "reflab_prod_preflight_ro",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "SELECT"
      ]
    },
    {
      "table": "user_profiles",
      "grantee": "reflab_rls_owner",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "SELECT"
      ]
    },
    {
      "table": "user_profiles",
      "grantee": "service_role",
      "grantor": "postgres",
      "grantable": false,
      "privileges": [
        "DELETE",
        "INSERT",
        "MAINTAIN",
        "REFERENCES",
        "SELECT",
        "TRIGGER",
        "TRUNCATE",
        "UPDATE"
      ]
    }
  ],
  "columnAcl": [
    {
      "table": "attempts",
      "column": "criterion_result",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "attempts",
      "column": "exam_result_id",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "attempts",
      "column": "id",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "attempts",
      "column": "score",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "attempts",
      "column": "source_item_type",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "attempts",
      "column": "user_id",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "exam_results",
      "column": "exam_session_id",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "exam_results",
      "column": "id",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "exam_results",
      "column": "submission_id",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "exam_results",
      "column": "user_id",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "match_preparations",
      "column": "user_id",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "notification_events",
      "column": "id",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "notification_events",
      "column": "user_id",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "post_match_reviews",
      "column": "user_id",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "psychology_checkins",
      "column": "user_id",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "psychology_exercise_sessions",
      "column": "user_id",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "psychology_wellbeing_assessments",
      "column": "user_id",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "rules_exam_results",
      "column": "user_id",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "user_profiles",
      "column": "user_id",
      "grantee": "reflab_preflight_audit_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    },
    {
      "table": "user_profiles",
      "column": "user_id",
      "grantee": "reflab_rls_owner",
      "grantor": "postgres",
      "privilege": "SELECT",
      "grantable": false
    }
  ],
  "identity": {
    "functions": [
      {
        "signature": "public.institution_request_user_id()",
        "identity_arguments": "",
        "result_type": "text",
        "language": "sql",
        "volatility": "s",
        "strict": false,
        "security_definer": false,
        "leakproof": false,
        "kind": "f",
        "owner": "postgres",
        "configuration": [
          "search_path=pg_catalog"
        ],
        "source_hash": "3b98e3dc7ede054761782c910afbf3120be785a3e7c29ef5db474f313306c11c"
      },
      {
        "signature": "public.platform_request_user_id()",
        "identity_arguments": "",
        "result_type": "text",
        "language": "sql",
        "volatility": "s",
        "strict": false,
        "security_definer": false,
        "leakproof": false,
        "kind": "f",
        "owner": "postgres",
        "configuration": [
          "search_path=pg_catalog"
        ],
        "source_hash": "3b98e3dc7ede054761782c910afbf3120be785a3e7c29ef5db474f313306c11c"
      },
      {
        "signature": "public.reflab_request_user_id()",
        "identity_arguments": "",
        "result_type": "text",
        "language": "sql",
        "volatility": "s",
        "strict": false,
        "security_definer": false,
        "leakproof": false,
        "kind": "f",
        "owner": "postgres",
        "configuration": [
          "search_path=pg_catalog"
        ],
        "source_hash": "3b98e3dc7ede054761782c910afbf3120be785a3e7c29ef5db474f313306c11c"
      },
      {
        "signature": "reflab_private.is_super_admin()",
        "identity_arguments": "",
        "result_type": "boolean",
        "language": "sql",
        "volatility": "s",
        "strict": false,
        "security_definer": true,
        "leakproof": false,
        "kind": "f",
        "owner": "reflab_rls_owner",
        "configuration": [
          "search_path=pg_catalog"
        ],
        "source_hash": "5daabe23a490557055a2129814bf408ebf2af42604ad21d25226cce01e4b9986"
      },
      {
        "signature": "reflab_private.request_user_id()",
        "identity_arguments": "",
        "result_type": "text",
        "language": "sql",
        "volatility": "s",
        "strict": false,
        "security_definer": false,
        "leakproof": false,
        "kind": "f",
        "owner": "postgres",
        "configuration": [
          "search_path=pg_catalog"
        ],
        "source_hash": "e8f03466a3552a13b61c5555e9bed5a8fb392d4236d9fd69fea720fc529cbcd5"
      }
    ],
    "acl": [
      {
        "signature": "public.institution_request_user_id()",
        "grantee": "authenticated",
        "grantor": "postgres",
        "privilege": "EXECUTE",
        "grantable": false
      },
      {
        "signature": "public.institution_request_user_id()",
        "grantee": "postgres",
        "grantor": "postgres",
        "privilege": "EXECUTE",
        "grantable": false
      },
      {
        "signature": "public.institution_request_user_id()",
        "grantee": "service_role",
        "grantor": "postgres",
        "privilege": "EXECUTE",
        "grantable": false
      },
      {
        "signature": "public.platform_request_user_id()",
        "grantee": "authenticated",
        "grantor": "postgres",
        "privilege": "EXECUTE",
        "grantable": false
      },
      {
        "signature": "public.platform_request_user_id()",
        "grantee": "postgres",
        "grantor": "postgres",
        "privilege": "EXECUTE",
        "grantable": false
      },
      {
        "signature": "public.platform_request_user_id()",
        "grantee": "service_role",
        "grantor": "postgres",
        "privilege": "EXECUTE",
        "grantable": false
      },
      {
        "signature": "public.reflab_request_user_id()",
        "grantee": "authenticated",
        "grantor": "postgres",
        "privilege": "EXECUTE",
        "grantable": false
      },
      {
        "signature": "public.reflab_request_user_id()",
        "grantee": "postgres",
        "grantor": "postgres",
        "privilege": "EXECUTE",
        "grantable": false
      },
      {
        "signature": "public.reflab_request_user_id()",
        "grantee": "service_role",
        "grantor": "postgres",
        "privilege": "EXECUTE",
        "grantable": false
      },
      {
        "signature": "reflab_private.is_super_admin()",
        "grantee": "authenticated",
        "grantor": "reflab_rls_owner",
        "privilege": "EXECUTE",
        "grantable": false
      },
      {
        "signature": "reflab_private.is_super_admin()",
        "grantee": "reflab_rls_owner",
        "grantor": "reflab_rls_owner",
        "privilege": "EXECUTE",
        "grantable": false
      },
      {
        "signature": "reflab_private.request_user_id()",
        "grantee": "authenticated",
        "grantor": "postgres",
        "privilege": "EXECUTE",
        "grantable": false
      },
      {
        "signature": "reflab_private.request_user_id()",
        "grantee": "postgres",
        "grantor": "postgres",
        "privilege": "EXECUTE",
        "grantable": false
      },
      {
        "signature": "reflab_private.request_user_id()",
        "grantee": "reflab_rls_owner",
        "grantor": "postgres",
        "privilege": "EXECUTE",
        "grantable": false
      }
    ],
    "schemaCreate": [
      {
        "role": "anon",
        "create": false,
        "schema": "public"
      },
      {
        "role": "anon",
        "create": false,
        "schema": "reflab_private"
      },
      {
        "role": "authenticated",
        "create": false,
        "schema": "public"
      },
      {
        "role": "authenticated",
        "create": false,
        "schema": "reflab_private"
      },
      {
        "role": "postgres",
        "create": true,
        "schema": "public"
      },
      {
        "role": "postgres",
        "create": true,
        "schema": "reflab_private"
      },
      {
        "role": "reflab_rls_owner",
        "create": false,
        "schema": "public"
      },
      {
        "role": "reflab_rls_owner",
        "create": false,
        "schema": "reflab_private"
      }
    ]
  },
  "adoption": {
    "ledgerChain": [
      {
        "phase_order": 1,
        "phase_key": "foundation",
        "previous_phase_key": null
      },
      {
        "phase_order": 2,
        "phase_key": "exam_training_prerequisites",
        "previous_phase_key": "foundation"
      },
      {
        "phase_order": 3,
        "phase_key": "psychology_notification_prerequisites",
        "previous_phase_key": "exam_training_prerequisites"
      },
      {
        "phase_order": 4,
        "phase_key": "canonical_objects",
        "previous_phase_key": "psychology_notification_prerequisites"
      }
    ],
    "schemaStateRows": 0,
    "canonicalMarkerAbsent": true,
    "runtimeDisabled": true,
    "cutoverAbsent": true,
    "phase4Absent": true,
    "developmentObjects": {
      "reflab_private.user_identity_links": false,
      "public.link_development_clerk_identity(text)": false,
      "public.resolve_development_clerk_identity(text)": false,
      "public.link_development_super_admin_clerk_identity(text)": false
    }
  },
  "historical": {
    "counts": {
      "clips": 30,
      "attempts": 37,
      "exam_results": 6,
      "notification_events": 60
    },
    "productFingerprint": "91aaa69942dd926d7c46e5830c6e9d3e",
    "protectedObjectsHash": "9a63c0b036054f580dc504a62266efa8"
  },
  "mutations": {
    "policyDrops": 7,
    "policyCreates": 22,
    "preservedPolicies": 20,
    "authenticatedDelete": 0,
    "productInserts": 0,
    "productUpdates": 0,
    "productDeletes": 0,
    "backfill": 0,
    "ledgerWrites": 0,
    "schemaStateWrites": 0,
    "markerWrites": 0,
    "runtimeWrites": 0,
    "cutoverWrites": 0,
    "notifications": 0,
    "functions": 0,
    "grants": 0,
    "owners": 0,
    "rls": 0,
    "force": 0,
    "indexes": 0,
    "constraints": 0,
    "triggers": 0,
    "schemas": 0
  }
});

