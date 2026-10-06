from pathlib import Path
import json,shutil
root=Path(__file__).resolve().parent.parent
repo=root/'outputs/wx2md-local-v1.0.0.p';app=repo/'local-archive';old=root/'outputs/wx2md-local-v1.2.1'
if app.exists():raise RuntimeError('Local baseline already exists')
shutil.copytree(old,app,ignore=shutil.ignore_patterns('node_modules','data','archives','logs','.git','.staging'))
pkg=json.loads((app/'package.json').read_text(encoding='utf-8'))
pkg['version']='1.0.0-p';pkg['releaseVersion']='1.0.0.p'
(app/'package.json').write_text(json.dumps(pkg,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
for relative in ('src/server.mjs','scripts/check-running.mjs'):
    p=app/relative;s=p.read_text(encoding='utf-8')
    line="const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;"
    assert line in s
    s=s.replace(line,"const packageInfo = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));\nconst version = packageInfo.releaseVersion || packageInfo.version;")
    p.write_text(s,encoding='utf-8')
p=app/'launch.ps1';s=p.read_text(encoding='utf-8')
s=s.replace("$taskExpectedVersion = (Get-Content -LiteralPath (Join-Path $taskAppRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version", "$taskPackageInfo = Get-Content -LiteralPath (Join-Path $taskAppRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json\n$taskExpectedVersion = if ($taskPackageInfo.releaseVersion) { $taskPackageInfo.releaseVersion } else { $taskPackageInfo.version }")
p.write_text(s,encoding='utf-8')
p=app/'src/archive.mjs';s=p.read_text(encoding='utf-8').replace("tool_version: '1.2.1'","tool_version: '1.0.0.p'");p.write_text(s,encoding='utf-8')
for filename in ('README.txt','THIRD_PARTY_NOTICES.txt','public/guide.html'):
    p=app/filename;s=p.read_text(encoding='utf-8').replace('1.2.1','1.0.0.p')
    s=s.replace('更新前服务为 1.2.0','更新前服务为 1.2.1').replace('更新前当前电脑运行 v1.2.0','更新前当前电脑运行 v1.2.1')
    s=s.replace('旧版程序、设置与文章保留','历史开发目录压缩归档，文章与设置迁入当前版本').replace('旧版本程序、配置和文章都保留','历史开发目录保留压缩包，文章与配置迁入当前版本')
    s=s.replace('旧记录仍引用旧归档绝对路径','旧记录的归档路径已迁移到当前版本').replace('旧文章通过原有绝对路径继续访问','旧文章通过迁移后的路径继续访问')
    s=s.replace('原文章仍在原目录','原文章已迁入当前版本的归档目录')
    s=s.replace('需要本地图片引用格式时点击“重新保存”','需要更新格式时点击“重新保存”')
    p.write_text(s,encoding='utf-8')
p=app/'CHANGELOG.txt';s=p.read_text(encoding='utf-8').replace('wx2md Local 更新记录\n','''wx2md Local 更新记录

v1.0.0.p — 2026-10-06
  将 v1.2.1 的功能冻结为个人开发基线；不是回退到最初的 v1.0.0。
  Git tag 为 v1.0.0.p；运行页面和元信息版本为 1.0.0.p。
  npm 使用合法版本 1.0.0-p，releaseVersion 记录请求的 1.0.0.p。
  本地仅保留当前工作目录，历史开发目录与原始证据压缩归档。
  迁移全部文章与最新任务库，修正保存记录的归档路径。
  增加 README、完整开发记录和整理／验证／发布记录。
  源码进入 dev/local-v1.0.0.p 分支，设置、凭据和文章不上传。
''',1);p.write_text(s,encoding='utf-8')
dev=repo/'development/scripts';dev.mkdir(parents=True)
for p in sorted((root/'work').glob('*')):
    if p.is_file() and p.suffix in ('.mjs','.py') and p.name!='prepare-personal-baseline.py':
        s=p.read_text(encoding='utf-8')
        s=s.replace('${USER_HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies', '${RUNTIME_DEPENDENCIES}')
        s=s.replace('${WORKSPACE}', '${WORKSPACE}')
        (dev/p.name).write_text(s,encoding='utf-8')
(dev/'README.md').write_text('''# 历史开发辅助脚本

这些文件记录研究、试验、版本准备、界面和真实文章验证、长图像素复核、打包与服务迁移过程。
它们保留开发时的相对目录和版本号，不作为当前工具的正式运行入口。
个人机器绝对路径替换为 `${WORKSPACE}` / `${RUNTIME_DEPENDENCIES}` 占位符；复跑时需按环境调整。
当前工具请从 `local-archive/` 启动和测试。原始脚本及输出保存在本机历史 ZIP 中。
''',encoding='utf-8')
source=(old/'node_modules/single-file-core').resolve()
shutil.copytree(source,app/'third-party-source/single-file-core')
p=app/'THIRD_PARTY_NOTICES.txt';s=p.read_text(encoding='utf-8').replace("The dependency's source and additional license notices are in node_modules.","The dependency's full source and additional notices are in third-party-source/single-file-core; installed dependency copies are in node_modules.");p.write_text(s,encoding='utf-8')
p=repo/'.gitignore';s=p.read_text(encoding='utf-8')+'\n# Private local runtime and development outputs\nlocal-archive/data/\nlocal-archive/archives/\nlocal-archive/logs/\nlocal-archive/.staging/\n.env\n.env.*\n*.sqlite\n*.sqlite-shm\n*.sqlite-wal\n*.pem\n*.key\n';p.write_text(s,encoding='utf-8')
(app/'AGENTS.md').write_text('''# Local archive developer instructions

This subproject is the user-requested Node.js local archive service. It is separate from the upstream Manifest V3 extension.
Keep Markdown images in images/ using portable relative paths; keep the title-based HTML self-contained and retain two lossless PNG reading profiles.
Preserve original image bytes, article extraction semantics, actual-scroll stitching, overlap validation, and local-only service binding.
Version display/tag uses releaseVersion; package.version must remain valid npm SemVer.
Run the relevant local tests, and `pnpm build` if SingleFile bundle inputs change.
Never commit data/, archives/, logs/, secrets, or real article content. Keep upstream and dependency notices.
''',encoding='utf-8')
print('Prepared personal baseline, complete local tool source, third-party source and historical development scripts.')
