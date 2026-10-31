param([switch]$ConfigurationProbe,[switch]$DatabaseProbe)
$ErrorActionPreference='Stop'
$linuxRoot=Split-Path $PSScriptRoot -Parent
$linuxOutput=Join-Path $linuxRoot 'tests/.build/deploy'
$linuxSdk=Join-Path $linuxOutput 'linux-sdk'
if(-not (Test-Path -LiteralPath $linuxSdk)){throw 'Preparar o SDK Linux da VM antes de compilar.'}
$linuxCompiler=(Get-Command dcclinux64.exe -ErrorAction Stop).Source
$linuxCompilerRoot=Split-Path (Split-Path $linuxCompiler -Parent) -Parent
$linuxPaths=@($linuxRoot,(Join-Path $linuxRoot 'utils'),(Join-Path $linuxRoot 'providers'),(Join-Path $linuxCompilerRoot 'lib/linux64/release'))
[xml]$linuxProject=[IO.File]::ReadAllText((Join-Path $linuxRoot 'ProjetoFaculdade.dproj'))
$linuxPaths+=($linuxProject.Project.PropertyGroup.DCC_UnitSearchPath|Where-Object {$_}|Select-Object -First 1).Split(';')|Where-Object {$_ -and $_ -notmatch '\$'}|ForEach-Object {Join-Path $linuxRoot $_}|Where-Object {Test-Path -LiteralPath $_}
$linuxLibraries=@((Join-Path $linuxCompilerRoot 'lib/linux64/release'),(Join-Path $linuxSdk 'usr/lib/x86_64-linux-gnu'),(Join-Path $linuxSdk 'lib/x86_64-linux-gnu'),(Join-Path $linuxSdk 'lib64'))
$linuxLibraries+=Get-ChildItem -LiteralPath (Join-Path $linuxSdk 'usr/lib/gcc/x86_64-linux-gnu') -Directory|Select-Object -ExpandProperty FullName
if($ConfigurationProbe -and $DatabaseProbe){throw 'Escolher somente um probe.'}
$linuxSource=if($ConfigurationProbe){Join-Path $linuxRoot 'tests/LinuxConfigurationProbe.dpr'}elseif($DatabaseProbe){Join-Path $linuxRoot 'tests/LinuxDatabaseProbe.dpr'}else{Join-Path $linuxRoot 'ProjetoFaculdade.dpr'}
Push-Location $linuxRoot
try {
    & $linuxCompiler '-B' '-Q' '-CC' '-NSSystem;Xml;Data;Datasnap;Web;Soap' ('-U'+($linuxPaths -join ';')) ('-I'+($linuxPaths -join ';')) ('-E'+$linuxOutput) ('-NU'+$linuxOutput) ('--syslibroot:'+$linuxSdk) ('--libpath:'+($linuxLibraries -join ';')) $linuxSource
    if($LASTEXITCODE -ne 0){throw 'Compilação Linux falhou.'}
}finally{Pop-Location}
