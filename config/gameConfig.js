// 游戏配置文件
// 所有游戏相关的配置都在这里统一管理

const GAME_CONFIG = {
  // 游戏时间配置
  TOTAL_TRADING_DAYS: 10,  // 游戏总交易日数 - 只需要修改这一个数字即可改变游戏时长
  
  // 初始资金配置
  INITIAL_CASH: 10000,    // 初始现金
  
  // 游戏开始配置
  INITIAL_INDEX: 29,       // 游戏开始的数据索引（第30天）
  
  // 文本配置 - 根据游戏天数动态生成
  getText: function() {
    return {
      CHALLENGE_NAME: `${this.TOTAL_TRADING_DAYS}天投资挑战`,
      CHALLENGE_COMPLETED: `${this.TOTAL_TRADING_DAYS}天投资挑战已完成`,
      CHALLENGE_JOURNEY_END: `${this.TOTAL_TRADING_DAYS}天投资之旅圆满结束`,
      INVESTMENT_DAYS: `${this.TOTAL_TRADING_DAYS}天`,
      LOG_TITLE: `${this.TOTAL_TRADING_DAYS}天投资挑战 - 详细交易日志`,
      SHARE_TITLE: `我在${this.TOTAL_TRADING_DAYS}天投资挑战中获得了{profitRate}%的收益！`,
      SHARE_TIMELINE_TITLE: `我在${this.TOTAL_TRADING_DAYS}天投资挑战中获得了{profitRate}%的收益！成就：{achievementTitle}`
    };
  },
  
  // 获取日均交易次数计算
  getDailyTradeAverage: function(totalTrades) {
    return totalTrades / this.TOTAL_TRADING_DAYS;
  }
};

module.exports = GAME_CONFIG; 