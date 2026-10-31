$ErrorActionPreference = 'Stop'
$testProjectRoot = Split-Path $PSScriptRoot -Parent
$testOutput = Join-Path $PSScriptRoot '.build'
New-Item -ItemType Directory -Force $testOutput | Out-Null
$utf8Bom = New-Object System.Text.UTF8Encoding($true)
$source = [IO.File]::ReadAllText((Join-Path $testProjectRoot 'ProjetoFaculdade.dpr'))
$source = $source.Replace('program ProjetoFaculdade;', 'program AuthHarness;').Replace('{$R *.res}', '')
$source = $source.Replace('  Horse,', "  Horse,`r`n  ErrosTeste in '" + (Join-Path $PSScriptRoot 'fixtures\ErrosTeste.pas') + "',")
$source = [regex]::Replace($source, "in '([^']+)'", {
  param($match)
  $unitPath = $match.Groups[1].Value
  if ($unitPath -eq 'providers\Conexao.pas') { $unitPath = 'tests\fixtures\Conexao.pas' }
  "in '" + (Join-Path $testProjectRoot $unitPath) + "'"
})
$source = $source.Replace('THorse.Use(CORS);', @'
PrepararBaseTeste;
    THorse.Use(procedure(Req: THorseRequest; Res: THorseResponse; Next: TProc)
      begin
        Res.RawWebResponse.SetCustomHeader('X-AutoCusto-Test', 'isolated');
        Next();
      end);
    THorse.Use(CORS);
'@)
$source = $source.Replace('THorse.Listen(9000,', "RegistrarRotasErrosTeste;`r`n    THorse.Listen(19001,")
[IO.File]::WriteAllText((Join-Path $testOutput 'AuthHarness.dpr'), $source, $utf8Bom)
[xml]$project = [IO.File]::ReadAllText((Join-Path $testProjectRoot 'ProjetoFaculdade.dproj'))
$searchPaths = @((Join-Path $PSScriptRoot 'fixtures'), $testProjectRoot)
$searchPaths += ($project.Project.PropertyGroup.DCC_UnitSearchPath | Where-Object { $_ } | Select-Object -First 1).Split(';') | Where-Object { $_ -notmatch '\$' } | ForEach-Object { Join-Path $testProjectRoot $_ } | Where-Object { Test-Path -LiteralPath $_ }
$delphiBin = Split-Path (Get-Command dcc32).Source -Parent
$searchPaths += (Join-Path (Split-Path $delphiBin -Parent) 'lib\win32\release')
Push-Location $testOutput
try {
  & (Join-Path $delphiBin 'dcc32.exe') '-B' '-Q' '-TX.exe' '-NSSystem;Xml;Data;Datasnap;Web;Soap;Winapi;System.Win;Data.Win;Web.Win' ('-U' + ($searchPaths -join ';')) ('-I' + ($searchPaths -join ';')) ('-E' + $testOutput) ('-N0' + $testOutput) 'AuthHarness.dpr'
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar harness de testes.' }
} finally { Pop-Location }
$probeOutput = Join-Path $testOutput 'connection-probe'
New-Item -ItemType Directory -Force $probeOutput | Out-Null
$probeSource = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'ConfigurationProbe.dpr'))
$probeSource = [regex]::Replace($probeSource, "in '([^']+)'", {
  param($match)
  "in '" + [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $match.Groups[1].Value)) + "'"
})
[IO.File]::WriteAllText((Join-Path $probeOutput 'ConfigurationProbe.dpr'), $probeSource, $utf8Bom)
$probeSearchPaths = @((Join-Path $testProjectRoot 'providers'), (Join-Path $testProjectRoot 'utils'))
$probeSearchPaths += $searchPaths | Where-Object { $_ -ne (Join-Path $PSScriptRoot 'fixtures') }
Push-Location $probeOutput
try {
  & (Join-Path $delphiBin 'dcc32.exe') '-B' '-Q' '-TX.exe' '-NSSystem;Xml;Data;Datasnap;Web;Soap;Winapi;System.Win;Data.Win;Web.Win' ('-U' + ($probeSearchPaths -join ';')) ('-I' + ($probeSearchPaths -join ';')) ('-E' + $testOutput) ('-N0' + $probeOutput) 'ConfigurationProbe.dpr'
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar verificação da configuração do banco.' }
} finally { Pop-Location }
