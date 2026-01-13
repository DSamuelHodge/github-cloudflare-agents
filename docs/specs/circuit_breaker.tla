---- MODULE circuit_breaker ----
EXTENDS Naturals, Sequences, TLC

CONSTANT FailureThreshold, SuccessThreshold, MaxFailureCount

VARIABLES state, failureCount, successCount

vars == <<state, failureCount, successCount>>

Init ==
    /\ state = "CLOSED"
    /\ failureCount = 0
    /\ successCount = 0

\* Actions
RecordFailure ==
    /\ state = "CLOSED"
    /\ failureCount < MaxFailureCount
    /\ failureCount' = failureCount + 1
    /\ successCount' = successCount
    /\ IF failureCount' >= FailureThreshold 
       THEN state' = "OPEN" 
       ELSE state' = "CLOSED"

RecordFailureHalfOpen ==
    /\ state = "HALF_OPEN"
    /\ failureCount < MaxFailureCount
    /\ state' = "OPEN"
    /\ failureCount' = failureCount + 1
    /\ successCount' = 0

RecordSuccessClosed ==
    /\ state = "CLOSED"
    /\ successCount' = 0
    /\ failureCount' = 0
    /\ state' = "CLOSED"

RecordSuccessHalfOpen ==
    /\ state = "HALF_OPEN"
    /\ successCount' = successCount + 1
    /\ failureCount' = 0
    /\ IF successCount' >= SuccessThreshold 
       THEN state' = "CLOSED" 
       ELSE state' = "HALF_OPEN"

TimeoutOpenToHalfOpen ==
    /\ state = "OPEN"
    /\ state' = "HALF_OPEN"
    /\ successCount' = 0
    /\ failureCount' = 0

Next ==
    \/ RecordFailure
    \/ RecordFailureHalfOpen
    \/ RecordSuccessClosed
    \/ RecordSuccessHalfOpen
    \/ TimeoutOpenToHalfOpen

\* Properties
TypeOK ==
    /\ state \in {"CLOSED", "HALF_OPEN", "OPEN"}
    /\ failureCount \in 0..MaxFailureCount
    /\ successCount \in 0..SuccessThreshold

Safety == 
    \/ state /= "OPEN"
    \/ failureCount >= FailureThreshold
    \/ successCount < SuccessThreshold

\* Temporal specification
Spec == Init /\ [][Next]_vars

=============================================================================