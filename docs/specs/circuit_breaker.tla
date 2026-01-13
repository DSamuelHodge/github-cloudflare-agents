---- MODULE circuit_breaker ----
EXTENDS Naturals, Sequences, TLC

(************************************************************************)
(* Model: Circuit Breaker state machine                                        *)
(************************************************************************)

CONSTANTS
    FailureThreshold, \* bound for model checking
    SuccessThreshold,
    MaxFailureCount

VARIABLES state, failureCount, successCount

States == {"CLOSED", "OPEN", "HALF_OPEN"}

Init ==
    /\ state = "CLOSED"
    /\ failureCount = 0
    /\ successCount = 0

\* Actions
RecordFailure ==
    /\ (state = "CLOSED")
    /\ failureCount' = failureCount + 1
    /\ successCount' = successCount
    /\ IF failureCount' >= FailureThreshold THEN state' = "OPEN" ELSE state' = "CLOSED"

RecordFailureHalfOpen ==
    /\ (state = "HALF_OPEN")
    /\ state' = "OPEN"
    /\ failureCount' = failureCount + 1
    /\ successCount' = 0

RecordSuccessClosed ==
    /\ (state = "CLOSED")
    /\ successCount' = 0
    /\ failureCount' = 0
    /\ state' = "CLOSED"

RecordSuccessHalfOpen ==
    /\ (state = "HALF_OPEN")
    /\ successCount' = successCount + 1
    /\ failureCount' = 0
    /\ IF successCount' >= SuccessThreshold THEN state' = "CLOSED" ELSE state' = "HALF_OPEN"

TimeoutOpenToHalfOpen ==
    /\ (state = "OPEN")
    /\ state' = "HALF_OPEN"
    /\ successCount' = 0
    /\ failureCount' = 0

\* Unchanged variables
Unchanged == state' = state /\ failureCount' = failureCount /\ successCount' = successCount

Next ==
    RecordFailure
    \/ RecordFailureHalfOpen
    \/ RecordSuccessClosed
    \/ RecordSuccessHalfOpen
    \/ TimeoutOpenToHalfOpen

\* Properties
Safety == \A s \in States: (state = "OPEN") => failureCount >= FailureThreshold

\* For TLC: statesubset bound
Spec == Init /\ [][Next]_<<state, failureCount, successCount>>

=============================================================================