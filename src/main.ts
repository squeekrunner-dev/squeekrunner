import Phaser from "phaser";

// Entry point placeholder scaffold. The real scenes (Boot, Run, GameOver) and the
// Squeekchain telemetry integration are implemented on top of this skeleton.
// See ../README.md and the project tech reference for the live API contract.

class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, "SqueekRunner\nscaffold — scenes TBD", {
        fontFamily: "monospace",
        fontSize: "24px",
        color: "#ffffff",
        align: "center",
      })
      .setOrigin(0.5);
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#1a1a20",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 540,
  },
  physics: { default: "arcade", arcade: { gravity: { x: 0, y: 1200 }, debug: false } },
  scene: [BootScene],
};

new Phaser.Game(config);
