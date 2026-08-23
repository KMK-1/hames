param(
    [string]$TaskId = ("task-" + (Get-Date -Format "yyyyMMdd-HHmmss")),
    [string]$Base = "main",
    [switch]$Video
)

$ErrorActionPreference = "Stop"

$Root = (git rev-parse --show-toplevel).Trim()
Set-Location $Root

foreach ($cmd in @("herdr", "git", "codex", "claude")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $cmd"
    }
}

if ((git status --porcelain)) {
    throw "Source checkout is dirty. Commit or stash changes first."
}

function New-HerdrWorktree {
    param([string]$Branch, [string]$Label)

    $json = herdr worktree create `
        --cwd $Root `
        --branch $Branch `
        --base $Base `
        --label $Label `
        --no-focus

    return ($json | ConvertFrom-Json)
}

Write-Host "Creating integration worktree..."
$integration = New-HerdrWorktree "agent/$TaskId/integration" "integration-$TaskId"
$IntegrationWs = $integration.result.workspace.workspace_id
$OrchPane = $integration.result.root_pane.pane_id

Write-Host "Creating code worktree..."
$code = New-HerdrWorktree "agent/$TaskId/code" "code-$TaskId"
$CodeWs = $code.result.workspace.workspace_id
$CodePane = $code.result.root_pane.pane_id

Write-Host "Creating UI worktree..."
$ui = New-HerdrWorktree "agent/$TaskId/ui" "ui-$TaskId"
$UiWs = $ui.result.workspace.workspace_id
$UiPane = $ui.result.root_pane.pane_id

Write-Host "Creating reviewer pane in integration workspace..."
$reviewSplitJson = herdr pane split $OrchPane --direction right --no-focus
$reviewSplit = $reviewSplitJson | ConvertFrom-Json
$ReviewPane = $reviewSplit.result.pane.pane_id

Write-Host "Starting agents..."
herdr agent start orchestrator --kind claude --pane $OrchPane -- --model claude-sonnet-5
herdr agent start reviewer --kind codex --pane $ReviewPane -- -m gpt-5.6-terra -c model_reasoning_effort=medium
herdr agent start code --kind codex --pane $CodePane -- -m gpt-5.6-terra -c model_reasoning_effort=medium
herdr agent start ui --kind claude --pane $UiPane -- --model claude-sonnet-5

$VideoWs = "n/a"
$VideoPane = "n/a"

if ($Video) {
    Write-Host "Creating video worktree..."
    $videoWt = New-HerdrWorktree "agent/$TaskId/video" "video-$TaskId"
    $VideoWs = $videoWt.result.workspace.workspace_id
    $VideoPane = $videoWt.result.root_pane.pane_id
    herdr agent start video --kind claude --pane $VideoPane -- --model claude-sonnet-5
}

Write-Host ""
Write-Host "Hames + Herdr runtime ready"
Write-Host "TASK_ID: $TaskId"
Write-Host "BASE: $Base"
Write-Host "integration workspace: $IntegrationWs"
Write-Host "orchestrator pane: $OrchPane"
Write-Host "reviewer pane: $ReviewPane"
Write-Host "code workspace/pane: $CodeWs / $CodePane"
Write-Host "ui workspace/pane: $UiWs / $UiPane"
Write-Host "video workspace/pane: $VideoWs / $VideoPane"
Write-Host ""
Write-Host "Next: focus/attach to 'orchestrator', activate HamesSystem, then provide the task."
