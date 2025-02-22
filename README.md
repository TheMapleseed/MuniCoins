# NFT Token Valuation and Redemption System

## System Architecture Overview

This repository implements a high-performance, enterprise-grade token valuation and redemption framework for NFT-based financial assets. The system employs a bifurcated capital structure with strict isolation between operational funds and premium reserves, ensuring robust financial operations while maintaining capital integrity.

### Core System Components

```
├── core/
│   ├── capital/
│   │   ├── BifurcatedCapitalManager.go
│   │   ├── OperationalFundService.go
│   │   └── PremiumReserveGuardian.go
│   ├── token/
│   │   ├── TokenRegistry.go
│   │   ├── TokenValuationEngine.go
│   │   └── RedemptionProcessor.go
│   └── performance/
│       ├── ReturnCalculationService.go
│       └── PerformanceAttributionEngine.go
├── infrastructure/
│   ├── persistence/
│   │   ├── TransactionalStateManager.go
│   │   └── AtomicOperationsHandler.go
│   └── monitoring/
│       ├── SystemHealthMonitor.go
│       └── IntegrityVerificationService.go
└── api/
    ├── TokenOperationsController.go
    ├── SystemStatusEndpoints.go
    └── PerformanceReportingService.go
```

## System Specification

### 1. Bifurcated Capital Model

The system implements a dual-tier capital architecture with strict segregation:

#### 1.1 Capital Structure

| Component | Initial Value | Formula | Purpose |
|-----------|---------------|---------|---------|
| Operational Fund | $900,000 | $P_{core} \times (N - N_{active})$ | Active investment capital |
| Premium Reserve | $315,000 | $P_{premium} \times (N - N_{active})$ | Segregated reserve (untouched) |

#### 1.2 Capital Constraints

The system enforces strict immutability of the premium reserve:

```go
// PremiumReserveGuardian.go
func (g *PremiumReserveGuardian) EnforceImmutability(ctx context.Context) error {
    expectedReserve := g.tokenParams.PremiumPrice * (g.tokenParams.TotalSupply - g.tokenParams.ActiveTokens)
    
    if g.reserveValue != expectedReserve {
        g.logger.Warn("Premium reserve integrity violation detected",
            zap.Float64("current", g.reserveValue),
            zap.Float64("expected", expectedReserve))
            
        // Restore reserve integrity
        g.reserveValue = expectedReserve
        
        if err := g.persistenceManager.StoreReserveState(ctx, g.reserveValue); err != nil {
            return fmt.Errorf("failed to restore reserve integrity: %w", err)
        }
        
        // Trigger audit event
        g.eventBus.Publish(events.ReserveIntegrityRestored{
            Timestamp:      time.Now().UTC(),
            ExpectedValue:  expectedReserve,
            PreviousValue:  g.reserveValue,
            CorrectiveAction: "automatic_restoration",
        })
    }
    
    return nil
}
```

### 2. Token Valuation Mechanism

#### 2.1 Token States

Each token exists in one of the following states:

| State | Description |
|-------|-------------|
| ACTIVE | Token is currently active and accruing value |
| INACTIVE | Token has been redeemed and reset to initial state |

#### 2.2 Valuation Formula

For an active token `i` at time `t`:

```
v_i(t) = P_initial × ∏(1 + R(j-1, j)) from j=t_i to t
```

Where:
- `P_initial` = Initial token price ($1.00)
- `t_i` = Token activation timestamp
- `R(j-1, j)` = Return rate of the fund between times j-1 and j

Implementation:

```go
// TokenValuationEngine.go
func (e *TokenValuationEngine) CalculateTokenValue(
    ctx context.Context, 
    tokenID uint64,
    evaluationTime time.Time,
) (decimal.Decimal, error) {
    token, err := e.tokenRegistry.GetToken(ctx, tokenID)
    if err != nil {
        return decimal.Zero, fmt.Errorf("failed to retrieve token %d: %w", tokenID, err)
    }
    
    if token.Status != TokenStatusActive {
        return decimal.Zero, ErrTokenNotActive
    }
    
    // Optimization: Use precomputed cumulative returns when available
    if cumulativeReturn, ok := e.getCachedCumulativeReturn(token.ActivationTime, evaluationTime); ok {
        return e.initialTokenPrice.Mul(cumulativeReturn), nil
    }
    
    value := e.initialTokenPrice
    periods, err := e.performanceService.GetReturnPeriods(ctx, token.ActivationTime, evaluationTime)
    if err != nil {
        return decimal.Zero, fmt.Errorf("failed to retrieve return periods: %w", err)
    }
    
    for _, period := range periods {
        // Convert return rate from percentage to multiplier (e.g., 10% -> 1.10)
        multiplier := decimal.NewFromFloat(1.0).Add(period.ReturnRate)
        value = value.Mul(multiplier)
    }
    
    // Cache cumulative return for future calculations
    e.cacheManager.StoreCumulativeReturn(token.ActivationTime, evaluationTime, value.Div(e.initialTokenPrice))
    
    return value, nil
}
```

#### 2.3 Token Redemption Process

When a token is redeemed:

1. Current token value is calculated based on fund performance since activation
2. Value is withdrawn from the operational fund
3. Token status is set to INACTIVE

```go
// RedemptionProcessor.go
func (p *RedemptionProcessor) ProcessRedemption(
    ctx context.Context,
    tokenID uint64,
) (TokenRedemptionResult, error) {
    // Begin transaction
    tx, err := p.transactionManager.BeginTransaction(ctx)
    if err != nil {
        return TokenRedemptionResult{}, fmt.Errorf("failed to begin transaction: %w", err)
    }
    defer tx.Rollback()
    
    // Get token with pessimistic lock
    token, err := p.tokenRegistry.GetTokenWithLock(ctx, tx, tokenID)
    if err != nil {
        return TokenRedemptionResult{}, fmt.Errorf("failed to retrieve token %d: %w", tokenID, err)
    }
    
    if token.Status != TokenStatusActive {
        return TokenRedemptionResult{}, ErrTokenNotActive
    }
    
    // Calculate redemption value
    redemptionValue, err := p.valuationEngine.CalculateTokenValue(ctx, tokenID, time.Now().UTC())
    if err != nil {
        return TokenRedemptionResult{}, fmt.Errorf("failed to calculate token value: %w", err)
    }
    
    // Verify sufficient operational fund balance
    currentFundValue, err := p.fundService.GetOperationalFundValue(ctx, tx)
    if err != nil {
        return TokenRedemptionResult{}, fmt.Errorf("failed to get operational fund value: %w", err)
    }
    
    if currentFundValue.LessThan(redemptionValue) {
        return TokenRedemptionResult{}, ErrInsufficientFunds
    }
    
    // Update operational fund
    newFundValue := currentFundValue.Sub(redemptionValue)
    if err := p.fundService.UpdateOperationalFundValue(ctx, tx, newFundValue); err != nil {
        return TokenRedemptionResult{}, fmt.Errorf("failed to update fund value: %w", err)
    }
    
    // Update token status
    token.Status = TokenStatusInactive
    token.RedemptionTime = time.Now().UTC()
    token.RedemptionValue = redemptionValue
    
    if err := p.tokenRegistry.UpdateToken(ctx, tx, token); err != nil {
        return TokenRedemptionResult{}, fmt.Errorf("failed to update token: %w", err)
    }
    
    // Commit transaction
    if err := tx.Commit(); err != nil {
        return TokenRedemptionResult{}, fmt.Errorf("failed to commit transaction: %w", err)
    }
    
    return TokenRedemptionResult{
        TokenID:         tokenID,
        RedemptionValue: redemptionValue,
        RedemptionTime:  token.RedemptionTime,
        NewFundValue:    newFundValue,
    }, nil
}
```

#### 2.4 Token Reissuance Process

When a redeemed token is reissued:

1. Token status is set to ACTIVE
2. New activation timestamp is recorded
3. Token value is reset to the initial price ($1.00)

### 3. Fund Performance Attribution

#### 3.1 Return Calculation

The system tracks returns for the operational fund:

```go
// ReturnCalculationService.go
func (s *ReturnCalculationService) CalculatePeriodReturn(
    ctx context.Context,
    startTime time.Time,
    endTime time.Time,
) (decimal.Decimal, error) {
    startValue, err := s.getHistoricalFundValue(ctx, startTime)
    if err != nil {
        return decimal.Zero, fmt.Errorf("failed to get start value: %w", err)
    }
    
    endValue, err := s.getHistoricalFundValue(ctx, endTime)
    if err != nil {
        return decimal.Zero, fmt.Errorf("failed to get end value: %w", err)
    }
    
    if startValue.IsZero() {
        return decimal.Zero, ErrDivisionByZero
    }
    
    // Calculate return rate
    returnRate := endValue.Sub(startValue).Div(startValue)
    
    // Store return rate for future reference
    if err := s.storeReturnRate(ctx, startTime, endTime, returnRate); err != nil {
        return returnRate, fmt.Errorf("failed to store return rate: %w", err)
    }
    
    return returnRate, nil
}
```

#### 3.2 Performance Attribution

Returns are calculated on the operational fund and applied proportionally to all active tokens:

```go
// PerformanceAttributionEngine.go
func (e *PerformanceAttributionEngine) ApplyMonthlyReturn(
    ctx context.Context,
    month time.Time,
    returnRate decimal.Decimal,
) error {
    tx, err := e.transactionManager.BeginTransaction(ctx)
    if err != nil {
        return fmt.Errorf("failed to begin transaction: %w", err)
    }
    defer tx.Rollback()
    
    // Update operational fund
    currentFundValue, err := e.fundService.GetOperationalFundValue(ctx, tx)
    if err != nil {
        return fmt.Errorf("failed to get operational fund value: %w", err)
    }
    
    newFundValue := currentFundValue.Mul(decimal.NewFromFloat(1).Add(returnRate))
    if err := e.fundService.UpdateOperationalFundValue(ctx, tx, newFundValue); err != nil {
        return fmt.Errorf("failed to update fund value: %w", err)
    }
    
    // Store return rate in history
    monthStart := time.Date(month.Year(), month.Month(), 1, 0, 0, 0, 0, time.UTC)
    monthEnd := monthStart.AddDate(0, 1, 0).Add(-time.Second)
    
    if err := e.returnService.StoreReturnRate(ctx, tx, monthStart, monthEnd, returnRate); err != nil {
        return fmt.Errorf("failed to store return rate: %w", err)
    }
    
    // Commit transaction
    if err := tx.Commit(); err != nil {
        return fmt.Errorf("failed to commit transaction: %w", err)
    }
    
    return nil
}
```

### 4. System Monitoring and Reporting

#### 4.1 Capital Integrity Verification

```go
// IntegrityVerificationService.go
func (s *IntegrityVerificationService) VerifySystemIntegrity(ctx context.Context) (*IntegrityReport, error) {
    report := &IntegrityReport{
        Timestamp: time.Now().UTC(),
        Checks:    make([]IntegrityCheck, 0),
    }
    
    // Verify premium reserve integrity
    expectedReserve := s.tokenParams.PremiumPrice * float64(s.tokenParams.TotalSupply - s.tokenParams.ActiveTokens)
    actualReserve, err := s.capitalManager.GetPremiumReserveValue(ctx)
    if err != nil {
        return nil, fmt.Errorf("failed to get premium reserve value: %w", err)
    }
    
    reserveIntegrityCheck := IntegrityCheck{
        CheckName:   "premium_reserve_integrity",
        Status:      IntegrityStatusPass,
        ExpectedValue: expectedReserve,
        ActualValue:   actualReserve,
    }
    
    if !decimal.NewFromFloat(expectedReserve).Equal(decimal.NewFromFloat(actualReserve)) {
        reserveIntegrityCheck.Status = IntegrityStatusFail
        report.OverallStatus = IntegrityStatusFail
    }
    
    report.Checks = append(report.Checks, reserveIntegrityCheck)
    
    // Additional integrity checks...
    
    return report, nil
}
```

#### 4.2 System Status Reporting

```go
// SystemStatusEndpoints.go
func (e *SystemStatusEndpoints) GetSystemStatus(c *gin.Context) {
    ctx := c.Request.Context()
    
    // Get active tokens count and values
    activeTokens, err := e.tokenRegistry.GetActiveTokenCount(ctx)
    if err != nil {
        c.JSON(http.StatusInternalServerError, ErrorResponse{
            Error: "Failed to get active token count",
            Code:  "INTERNAL_ERROR",
        })
        return
    }
    
    tokenValues, err := e.tokenRegistry.GetAllActiveTokenValues(ctx)
    if err != nil {
        c.JSON(http.StatusInternalServerError, ErrorResponse{
            Error: "Failed to get token values",
            Code:  "INTERNAL_ERROR",
        })
        return
    }
    
    totalTokenValue := decimal.Zero
    for _, value := range tokenValues {
        totalTokenValue = totalTokenValue.Add(value)
    }
    
    // Get fund values
    operationalFund, err := e.fundService.GetOperationalFundValue(ctx, nil)
    if err != nil {
        c.JSON(http.StatusInternalServerError, ErrorResponse{
            Error: "Failed to get operational fund value",
            Code:  "INTERNAL_ERROR",
        })
        return
    }
    
    premiumReserve, err := e.capitalManager.GetPremiumReserveValue(ctx)
    if err != nil {
        c.JSON(http.StatusInternalServerError, ErrorResponse{
            Error: "Failed to get premium reserve value",
            Code:  "INTERNAL_ERROR",
        })
        return
    }
    
    // Calculate metrics
    var averageTokenValue decimal.Decimal
    if activeTokens > 0 {
        averageTokenValue = totalTokenValue.Div(decimal.NewFromInt(int64(activeTokens)))
    }
    
    var redemptionCoverageRatio decimal.Decimal
    if !totalTokenValue.IsZero() {
        redemptionCoverageRatio = operationalFund.Div(totalTokenValue)
    }
    
    // Calculate performance metrics
    inceptionReturn, err := e.performanceService.CalculateInceptionToDateReturn(ctx)
    if err != nil {
        c.JSON(http.StatusInternalServerError, ErrorResponse{
            Error: "Failed to calculate inception return",
            Code:  "INTERNAL_ERROR",
        })
        return
    }
    
    c.JSON(http.StatusOK, SystemStatusResponse{
        Timestamp:              time.Now().UTC(),
        OperationalFundValue:   operationalFund,
        PremiumReserveValue:    decimal.NewFromFloat(premiumReserve),
        SystemNAV:              operationalFund.Add(totalTokenValue).Add(decimal.NewFromFloat(premiumReserve)),
        ActiveTokens:           activeTokens,
        InactiveTokens:         e.tokenParams.TotalSupply - activeTokens,
        TotalTokenValue:        totalTokenValue,
        AverageTokenValue:      averageTokenValue,
        RedemptionCoverageRatio: redemptionCoverageRatio,
        InceptionReturn:        inceptionReturn,
    })
}
```

## System Initialization and Configuration

### 1. Initial System Parameters

```go
// Initial system parameters
type SystemParameters struct {
    TotalTokens     uint64          `json:"totalTokens"`
    ActiveTokens    uint64          `json:"activeTokens"`
    InitialPrice    decimal.Decimal `json:"initialPrice"`
    SalePrice       decimal.Decimal `json:"salePrice"`
    CoreComponent   decimal.Decimal `json:"coreComponent"`
    PremiumComponent decimal.Decimal `json:"premiumComponent"`
}

// Default configuration
var DefaultSystemParameters = SystemParameters{
    TotalTokens:      1_000_000,
    ActiveTokens:     100_000,
    InitialPrice:     decimal.NewFromFloat(1.00),
    SalePrice:        decimal.NewFromFloat(1.35),
    CoreComponent:    decimal.NewFromFloat(1.00),
    PremiumComponent: decimal.NewFromFloat(0.35),
}
```

### 2. System Bootstrap Process

```go
// main.go
func main() {
    ctx := context.Background()
    
    // Load configuration
    config, err := LoadConfiguration("config.yaml")
    if err != nil {
        log.Fatalf("Failed to load configuration: %v", err)
    }
    
    // Initialize persistence layer
    db, err := InitializeDatabase(config.Database)
    if err != nil {
        log.Fatalf("Failed to initialize database: %v", err)
    }
    defer db.Close()
    
    // Initialize system components
    transactionManager := persistence.NewTransactionManager(db)
    capitalManager := capital.NewBifurcatedCapitalManager(
        transactionManager,
        config.SystemParameters,
    )
    
    tokenRegistry := token.NewTokenRegistry(db, transactionManager)
    performanceService := performance.NewReturnCalculationService(db, transactionManager)
    
    // Initialize system
    systemInitializer := NewSystemInitializer(
        capitalManager,
        tokenRegistry,
        performanceService,
        config.SystemParameters,
    )
    
    if err := systemInitializer.Initialize(ctx); err != nil {
        log.Fatalf("Failed to initialize system: %v", err)
    }
    
    // Start API server
    router := SetupRouter(
        capitalManager,
        tokenRegistry,
        performanceService,
    )
    
    log.Printf("Starting server on %s", config.Server.Address)
    if err := router.Run(config.Server.Address); err != nil {
        log.Fatalf("Failed to start server: %v", err)
    }
}
```

## Usage Examples

### 1. Token Redemption Example

```go
// Client code example
func RedeemToken(tokenID uint64) {
    client := NewAPIClient("https://api.tokensystem.example")
    
    redemptionResult, err := client.RedeemToken(context.Background(), tokenID)
    if err != nil {
        log.Fatalf("Failed to redeem token: %v", err)
    }
    
    fmt.Printf("Token %d redeemed successfully\n", tokenID)
    fmt.Printf("Redemption value: $%.2f\n", redemptionResult.RedemptionValue)
    fmt.Printf("Redemption time: %s\n", redemptionResult.RedemptionTime)
}
```

### 2. Calculating Token Value

```go
// Calculate monthly earnings for a specific token
func CalculateMonthlyEarnings(tokenID uint64, monthReturnRate float64) {
    client := NewAPIClient("https://api.tokensystem.example")
    
    // Get current token value
    tokenValue, err := client.GetTokenValue(context.Background(), tokenID)
    if err != nil {
        log.Fatalf("Failed to get token value: %v", err)
    }
    
    // Calculate earnings
    earnings := tokenValue * monthReturnRate
    
    fmt.Printf("Token %d current value: $%.2f\n", tokenID, tokenValue)
    fmt.Printf("Monthly return rate: %.2f%%\n", monthReturnRate * 100)
    fmt.Printf("Monthly earnings: $%.2f\n", earnings)
}
```

## Advanced Implementation Considerations

### 1. Scalability and Performance Optimization

The system implements several performance optimizations:

1. **Precomputed Cumulative Returns**: For tokens with long histories, the system stores precomputed cumulative returns at regular intervals (e.g., monthly) to reduce the computational overhead of token valuation.

2. **Concurrent Token Processing**: The system processes token valuations concurrently using worker pools to maximize throughput during high-volume operations.

3. **Database Indexing Strategy**: Specialized indexes on token status, activation time, and fund performance periods enable efficient querying and retrieval.

### 2. Security and Compliance

1. **Premium Reserve Protection**: The system implements multiple layers of validation to ensure the immutability of the premium reserve:
   - Database-level constraints
   - Application-level validation
   - Periodic integrity verification
   - Alerting for any anomalies

2. **Audit Trail**: All system operations are logged with detailed information for auditability and compliance:
   - Token state changes
   - Fund value updates
   - Reserve integrity checks
   - Administrative actions

### 3. Fault Tolerance and Recovery

1. **Transactional Integrity**: All operations that modify system state are executed within transactions to ensure atomicity and consistency.

2. **State Recovery**: The system implements point-in-time recovery capabilities to restore the system state to any previous point in its history.

3. **Reconciliation Process**: Automated reconciliation processes verify the consistency of token values with fund performance history to detect and correct any discrepancies.

## Deployment and Infrastructure

### 1. Containerization

The system is containerized using Docker with multi-stage builds to minimize image size and maximize security:

```dockerfile
# Dockerfile
FROM golang:1.19-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o token-system ./cmd/server

FROM alpine:3.16
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /root/

COPY --from=builder /app/token-system .
COPY --from=builder /app/config.yaml .

EXPOSE 8080
CMD ["./token-system"]
```

### 2. Kubernetes Deployment

The system is designed for deployment on Kubernetes with high availability:

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: token-system
spec:
  replicas: 3
  selector:
    matchLabels:
      app: token-system
  template:
    metadata:
      labels:
        app: token-system
    spec:
      containers:
      - name: token-system
        image: token-system:latest
        ports:
        - containerPort: 8080
        resources:
          limits:
            cpu: "1"
            memory: "1Gi"
          requests:
            cpu: "500m"
            memory: "512Mi"
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 15
          periodSeconds: 20
        env:
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: token-system-config
              key: db_host
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: token-system-secrets
              key: db_password
```

