/**
 * 投资策略建议系统
 * 基于用户行为和市场数据提供投资建议
 */

class InvestmentAdvisor {
  constructor() {
    this.strategies = {
      conservative: {
        name: '稳健型',
        maxSingleInvestment: 0.2, // 单次最大投资比例
        riskTolerance: 0.05, // 风险承受度
        rebalanceThreshold: 0.1, // 再平衡阈值
        description: '追求稳定收益，风险较低'
      },
      balanced: {
        name: '平衡型',
        maxSingleInvestment: 0.3,
        riskTolerance: 0.1,
        rebalanceThreshold: 0.15,
        description: '平衡风险与收益'
      },
      aggressive: {
        name: '激进型',
        maxSingleInvestment: 0.5,
        riskTolerance: 0.2,
        rebalanceThreshold: 0.2,
        description: '追求高收益，承担较高风险'
      }
    };

    this.marketConditions = {
      bull: '牛市',
      bear: '熊市',
      sideways: '震荡市'
    };
  }

  /**
   * 分析市场趋势
   * @param {Array} priceData - 价格数据
   * @param {number} period - 分析周期
   * @returns {Object} 市场分析结果
   */
  analyzeMarketTrend(priceData, period = 5) {
    if (!priceData || priceData.length < period) {
      return { trend: 'unknown', confidence: 0 };
    }

    const recentData = priceData.slice(-period);
    const firstPrice = recentData[0].indexValue;
    const lastPrice = recentData[recentData.length - 1].indexValue;
    const change = (lastPrice - firstPrice) / firstPrice;

    // 计算波动率
    const returns = [];
    for (let i = 1; i < recentData.length; i++) {
      const dailyReturn = (recentData[i].indexValue - recentData[i-1].indexValue) / recentData[i-1].indexValue;
      returns.push(dailyReturn);
    }
    
    const volatility = this.calculateVolatility(returns);
    
    let trend, confidence;
    
    if (change > 0.05) {
      trend = 'bull';
      confidence = Math.min(change * 10, 1);
    } else if (change < -0.05) {
      trend = 'bear';
      confidence = Math.min(Math.abs(change) * 10, 1);
    } else {
      trend = 'sideways';
      confidence = 1 - volatility * 5; // 低波动率表示震荡市确定性高
    }

    return {
      trend,
      confidence: Math.max(0, Math.min(1, confidence)),
      change,
      volatility
    };
  }

  /**
   * 计算波动率
   * @param {Array} returns - 收益率数组
   * @returns {number} 波动率
   */
  calculateVolatility(returns) {
    if (returns.length === 0) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  /**
   * 获取投资建议
   * @param {Object} userProfile - 用户画像
   * @param {Object} marketAnalysis - 市场分析
   * @param {Object} currentPosition - 当前持仓
   * @returns {Object} 投资建议
   */
  getInvestmentAdvice(userProfile, marketAnalysis, currentPosition) {
    const strategy = this.strategies[userProfile.riskProfile] || this.strategies.balanced;
    const advice = {
      action: 'hold', // buy, sell, hold
      amount: 0,
      reason: '',
      confidence: 0,
      tips: []
    };

    const { availableCash, totalAssets, profitRate } = currentPosition;
    const cashRatio = availableCash / totalAssets;
    const { trend, confidence, volatility } = marketAnalysis;

    // 基于市场趋势的建议
    if (trend === 'bull' && confidence > 0.6) {
      if (cashRatio > 0.3) {
        advice.action = 'buy';
        advice.amount = Math.min(
          availableCash * strategy.maxSingleInvestment,
          availableCash * 0.5
        );
        advice.reason = '市场呈上升趋势，建议适当增加投资';
        advice.confidence = confidence;
      }
    } else if (trend === 'bear' && confidence > 0.6) {
      if (cashRatio < 0.5 && profitRate > 0) {
        advice.action = 'sell';
        advice.amount = (totalAssets - availableCash) * 0.3;
        advice.reason = '市场呈下降趋势，建议适当减仓保护收益';
        advice.confidence = confidence;
      }
    } else if (trend === 'sideways') {
      if (volatility > 0.02) {
        advice.tips.push('市场震荡较大，建议分批投资降低风险');
      }
      advice.reason = '市场震荡，建议保持当前仓位';
    }

    // 风险控制建议
    if (cashRatio < 0.1) {
      advice.tips.push('现金比例过低，建议保留一定现金应对风险');
    }

    if (profitRate > 0.2) {
      advice.tips.push('收益较好，可考虑适当止盈');
    } else if (profitRate < -0.1) {
      advice.tips.push('出现亏损，建议检查投资策略');
    }

    return advice;
  }

  /**
   * 生成投资教育内容
   * @param {Object} userBehavior - 用户行为数据
   * @returns {Object} 教育内容
   */
  generateEducationContent(userBehavior) {
    const { tradingFrequency, averageHoldingPeriod, riskTaking } = userBehavior;
    const tips = [];

    if (tradingFrequency > 2) {
      tips.push({
        title: '频繁交易风险',
        content: '过于频繁的交易可能增加成本并影响收益，建议采用长期投资策略。',
        type: 'warning'
      });
    }

    if (averageHoldingPeriod < 3) {
      tips.push({
        title: '短期投资风险',
        content: '基金投资建议长期持有，短期波动是正常现象。',
        type: 'info'
      });
    }

    if (riskTaking > 0.8) {
      tips.push({
        title: '风险管理',
        content: '高风险投资需要做好风险管理，不要将所有资金投入单一资产。',
        type: 'warning'
      });
    }

    return {
      tips,
      recommendedReading: [
        '基金投资入门指南',
        '如何进行资产配置',
        '长期投资的复利效应'
      ]
    };
  }

  /**
   * 评估用户风险偏好
   * @param {Array} tradingHistory - 交易历史
   * @returns {string} 风险偏好类型
   */
  assessRiskProfile(tradingHistory) {
    if (!tradingHistory || tradingHistory.length === 0) {
      return 'balanced';
    }

    let totalInvestment = 0;
    let maxSingleInvestment = 0;
    let tradingCount = tradingHistory.length;

    tradingHistory.forEach(trade => {
      if (trade.type === 'buy') {
        // 对于买入交易，amount 字段统一表示金额
        const amount = trade.amount;
        totalInvestment += amount;
        maxSingleInvestment = Math.max(maxSingleInvestment, amount);
      }
    });

    const avgInvestment = totalInvestment / tradingCount;
    const riskRatio = maxSingleInvestment / avgInvestment;

    if (riskRatio > 3 || tradingCount > 15) {
      return 'aggressive';
    } else if (riskRatio < 1.5 && tradingCount < 5) {
      return 'conservative';
    } else {
      return 'balanced';
    }
  }

  /**
   * 生成个性化建议
   * @param {Object} userData - 用户数据（标准格式）
   * @param {Array} marketData - 市场数据
   * @returns {Object} 个性化建议
   */
  generatePersonalizedAdvice(userData, marketData) {
    // 使用新的标准数据结构
    const fundInfo = userData.fundData && userData.fundData.length > 0 
      ? userData.fundData[0] 
      : { shares: 0, transactions: [] };
      
    const riskProfile = this.assessRiskProfile(fundInfo.transactions);
    const marketAnalysis = this.analyzeMarketTrend(marketData);
    
    // 从标准数据结构计算当前投资状况
    const currentPosition = {
          availableCash: require('./dataStructureUtils.js').calculateAvailableCash(userData),
    totalAssets: userData.totalAssets,
      profitRate: userData.totalProfitRate || 0
    };

    const userProfile = { riskProfile };
    const advice = this.getInvestmentAdvice(userProfile, marketAnalysis, currentPosition);
    
    const userBehavior = {
      tradingFrequency: fundInfo.transactions?.length || 0,
      averageHoldingPeriod: this.calculateAverageHoldingPeriod(fundInfo.transactions),
      riskTaking: riskProfile === 'aggressive' ? 0.9 : riskProfile === 'conservative' ? 0.3 : 0.6
    };
    
    const education = this.generateEducationContent(userBehavior);

    return {
      riskProfile,
      marketAnalysis,
      advice,
      education,
      strategy: this.strategies[riskProfile]
    };
  }

  /**
   * 计算平均持有期
   * @param {Array} transactions - 交易记录
   * @returns {number} 平均持有天数
   */
  calculateAverageHoldingPeriod(transactions) {
    if (!transactions || transactions.length < 2) return 0;

    const buyTrades = transactions.filter(t => t.type === 'buy');
    const sellTrades = transactions.filter(t => t.type === 'sell');

    if (buyTrades.length === 0 || sellTrades.length === 0) return 0;

    let totalHoldingDays = 0;
    let pairCount = 0;

    buyTrades.forEach(buy => {
      const correspondingSell = sellTrades.find(sell => 
        new Date(sell.timestamp) > new Date(buy.timestamp)
      );
      
      if (correspondingSell) {
        const holdingDays = (new Date(correspondingSell.timestamp) - new Date(buy.timestamp)) / (1000 * 60 * 60 * 24);
        totalHoldingDays += holdingDays;
        pairCount++;
      }
    });

    return pairCount > 0 ? totalHoldingDays / pairCount : 0;
  }
}

module.exports = InvestmentAdvisor; 