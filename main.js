// 遊戲狀態
let player = {
    lv: 1, stage: 1,
    hp: 100, maxHp: 100,
    atk: 10, def: 5, cri: 5, dod: 5
};

let enemy = { hp: 50, atk: 8, def: 2 };

// 初始化顯示
function updateUI() {
    document.getElementById('atk').innerText = player.atk;
    document.getElementById('def').innerText = player.def;
    document.getElementById('cri').innerText = player.cri;
    document.getElementById('dod').innerText = player.dod;
    document.getElementById('level-display').innerText = `Level: ${player.lv}`;
    document.getElementById('hp-fill').style.width = (player.hp / player.maxHp * 100) + "%";
    
    // 更新進度點
    const dots = document.querySelectorAll('.dot');
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index < player.stage - 1);
    });
}

// 進入事件階段
function startEvent() {
    if (player.stage <= 3) {
        document.getElementById('event-layer').classList.remove('hidden');
    } else {
        startBossFight();
    }
}

// 選擇事件
function chooseEvent(type) {
    if (type === 'atk') player.atk += 2;
    if (type === 'def') player.def += 2;
    
    player.stage++;
    document.getElementById('event-layer').classList.add('hidden');
    updateUI();
    setTimeout(startEvent, 500);
}

// 自動戰鬥邏輯
async function startBossFight() {
    document.getElementById('battle-log').innerText = "BOSS 出現！";
    enemy.hp = 30 + (player.lv * 20); // Boss 隨等級變強
    
    while (player.hp > 0 && enemy.hp > 0) {
        // 玩家攻擊
        let pDmg = Math.max(1, player.atk - enemy.def);
        if (Math.random() * 100 < player.cri) pDmg *= 2; // 爆擊
        enemy.hp -= pDmg;
        document.getElementById('battle-log').innerText = `你造成了 ${pDmg} 傷害`;
        await new Promise(r => setTimeout(r, 600));

        if (enemy.hp <= 0) break;

        // 敵人攻擊
        if (Math.random() * 100 > player.dod) { // 沒閃避才扣血
            let eDmg = Math.max(1, enemy.atk - player.def);
            player.hp -= eDmg;
            document.getElementById('battle-log').innerText = `敵人造成 ${eDmg} 傷害`;
        } else {
            document.getElementById('battle-log').innerText = `你閃避了攻擊！`;
        }
        updateUI();
        await new Promise(r => setTimeout(r, 600));
    }

    if (player.hp > 0) {
        alert("勝利！進入下一關");
        player.lv++;
        player.stage = 1;
        player.hp = player.maxHp; // 滿血進入下一關
        updateUI();
        startEvent();
    } else {
        alert("你倒下了... 遊戲結束");
        location.reload();
    }
}

// 啟動遊戲
updateUI();
startEvent();
