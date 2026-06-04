pub fn install_save_skill(skills_dir: &std::path::Path) -> Result<(), String> {
    let save_dir = skills_dir.join("save");
    std::fs::create_dir_all(&save_dir).map_err(|e| e.to_string())?;
    std::fs::write(
        save_dir.join("SKILL.md"),
        include_str!("../../../../skills/save/SKILL.md"),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
