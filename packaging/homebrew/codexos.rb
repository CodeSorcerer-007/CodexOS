cask "codexos" do
  arch arm: "aarch64", intel: "x64"

  version "2.2.0"
  sha256 arm:   "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
         intel: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

  url "https://github.com/CodeSorcerer-007/CodexOS/releases/download/v#{version}/CodexOS_#{version}_#{arch}.dmg"
  name "CodexOS"
  desc "Privacy-first offline developer desktop operating environment"
  homepage "https://github.com/CodeSorcerer-007/CodexOS"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :catalina"

  app "CodexOS.app"
  binary "#{appdir}/CodexOS.app/Contents/MacOS/CodexOS", target: "codexos"

  zap trash: [
    "~/Library/Application Support/com.codexos.app",
    "~/Library/Caches/com.codexos.app",
    "~/Library/Preferences/com.codexos.app.plist",
    "~/Library/Saved Application State/com.codexos.app.savedState",
    "~/.codexos",
  ]
end
