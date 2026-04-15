# Handoff: Desktop SSH install issue

## 当前状态

- 本轮只做了代码排查，没有修改产品代码。
- 问题场景来自客户机，不是当前机器。
- 旧文档里 `~/.gitmemo/.ssh/id_ed25519` 的描述已确认过时，不应作为当前行为依据。

## 已确认结论

1. Desktop 安装阶段的 SSH key 逻辑在 `desktop/src-tauri/src/commands/init.rs`。
2. 当前安装阶段只会在 `~/.ssh/` 下按固定文件名查找：
   - `id_ed25519`
   - `id_rsa`
   - `id_ecdsa`
3. 如果没找到，就会尝试生成 `~/.ssh/id_ed25519`。
4. 真正远端同步时没有强制指定同一把 key，而是直接调用系统 `git fetch/push`。
5. 因此“安装时展示/复制的 key”与“git 实际同步使用的 key”可能不是同一把。
6. 如果客户机依赖自定义命名 key 或 `~/.ssh/config` 中的 `IdentityFile`，GitMemo 可能误判为“没有 key”。
7. Setup 向导当前会把后端返回结果直接显示为完成页；SSH 步骤失败会出现在步骤列表里，但前端没有基于 `result.success` 阻止用户继续进入应用。

## 重点代码位置

- `desktop/src-tauri/src/commands/init.rs`
  - `find_or_generate_ssh_key()`
  - `do_remote_init_sync()`
- `src/utils/ssh.rs`
  - `find_existing_key()`
  - `find_or_generate_key()`
  - `test_ssh_connection()`
- `src/storage/git.rs`
  - `commit_and_push()`
  - `push()`
  - `pull()`
- `desktop/src/components/SetupWizard.tsx`
  - `runInit()`
  - 完成页对 `result.steps` 的展示

## 当前最可能的问题方向

- 客户机 SSH 本身可用，但 GitMemo 的“key 发现逻辑”与客户机实际 SSH 配置不兼容。
- 客户机安装阶段尝试生成默认 key 时，环境里 `HOME`、`~/.ssh` 可写性，或 `ssh-keygen` 调用出现问题。
- 如果客户机终端里直接 `git ls-remote` 可成功，而 GitMemo 安装时仍报 SSH key 错，优先判断为 GitMemo 识别逻辑问题，不是客户机完全无法同步。

## 尚未验证

- 客户机 `~/.ssh/config` 是否存在 `IdentityFile`
- 客户机实际使用的 key 是否为自定义文件名
- 客户机直接执行 `git ls-remote` / `ssh -T git@host` 是否成功
- 客户机报错里 `ssh-keygen` 的完整 stderr
- 客户机环境变量 `HOME` 是否异常

## 建议下一步

1. 向客户机收集最小信息：
   - `ls -la ~/.ssh`
   - `sed -n '1,120p' ~/.ssh/config`
   - `which ssh-keygen`
   - `echo $HOME`
   - 对目标远端执行一次 `ssh -T git@<host>` 或 `git ls-remote <remote-url>`
2. 如果客户机系统 git 可连通远端，但 GitMemo 安装报 SSH key 错：
   - 修 `find_or_generate_ssh_key()`，让 Desktop 复用 `src/utils/ssh.rs` 的能力，避免双实现继续漂移。
   - 进一步支持从 `~/.ssh/config` 读取或至少不误判自定义 key。
3. 修 Setup 向导的完成态：
   - 若 `result.success == false`，不要直接给“设置完成”的主成功态。
   - 对远端模式下的 SSH 错误给更明确的引导。
4. 更新旧文档，删除 `~/.gitmemo/.ssh/` 的历史描述。

## 备注

- 本轮没有进入代码修改阶段，因此仓库业务代码仍保持原状。
- 已把本轮分析同步到 GitMemo 会话记录，下一位 AI 可结合本文件继续。
