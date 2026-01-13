---- MODULE circuit_breaker ----
EXTENDS Naturals, Sequences, TLC

(************************************************************************)
(* Model: Circuit Breaker state machine                                        *)
(************************************************************************)

\* CONSTANTS removed for local model run (values inlined)
    \* FailureThreshold == 2
    \* SuccessThreshold == 2
    \* MaxFailureCount == 3

VARIABLES state, failureCount, successCount

States == {"CLOSED", "OPEN", "HALF_OPEN"}

\* Model constants inlined for local checks
FailureThreshold == 2
SuccessThreshold == 2
MaxFailureCount == 3

Init ==
    /\ state = "CLOSED"
    /\ failureCount = 0
    /\ successCount = 0

\* Actions
RecordFailure ==
    /\ (state = "CLOSED")
    /\ failureCount' = failureCount + 1
    /\ successCount' = successCount
    /\ IF failureCount' >= 2 THEN state' = "OPEN" ELSE state' = "CLOSED"

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
    /\ IF successCount' >= 2 THEN state' = "CLOSED" ELSE state' = "HALF_OPEN"

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
Safety == (state = "OPEN") => failureCount >= FailureThreshold

\* For TLC: statesubset bound
Spec == Init /\ [][Next]_<<state, failureCount, successCount>>

=============================================================================