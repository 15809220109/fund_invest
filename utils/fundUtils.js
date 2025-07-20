/**
 * Fund Utilities
 * Helper functions for fund calculations
 */

const assetLogger = require('./assetLogger.js');
const GAME_CONFIG = require('../config/gameConfig.js');

/**
 * 统一精度处理标准
 * 原则：计算过程保持最高精度，仅在最终输出时进行精度处理
 */

// 精度配置常量
const PRECISION_CONFIG = {
  // 金额相关精度（2位小数）
  MONEY: 2,           // 现金、金额、收益
  
  // 净值相关精度（4位小数）
  NET_VALUE: 4,       // 净值、成本价
  
  // 份额相关精度（2位小数）
  UNITS: 2,           // 基金份额
  
  // 百分比相关精度（2位小数） 
  PERCENTAGE: 2,      // 收益率、涨跌幅
  
  // 计算过程精度（保持最高精度，不舍入）
  CALCULATION: -1     // 表示不进行精度处理
};

/**
 * 安全解析浮点数
 * @param {any} value - 要解析的值
 * @param {number} defaultValue - 默认值
 * @returns {number} 解析后的数值
 */
function safeParseFloat(value, defaultValue = 0) {
  return parseFloat(value) || defaultValue;
}

/**
 * 从交易记录计算份额
 * @param {Object} record - 交易记录
 * @returns {number} 份额数量
 */
function calculateUnitsFromRecord(record) {
  // 直接使用 units 字段
  return safeParseFloat(record.units);
}

/**
 * Calculate the number of fund units that can be purchased with a given amount
 * @param {number} amount - Amount to invest
 * @param {number} netValue - Current net value of the fund
 * @returns {number} Number of fund units
 */
function calculatePurchaseUnits(amount, netValue) {
  if (netValue <= 0) {
    return 0;
  }
  
  const safeAmount = safeParseFloat(amount);
  const safeNetValue = safeParseFloat(netValue);
  const result = safeDivide(safeAmount, safeNetValue);
  
  return result;
}

/**
 * Calculate the current value of fund shares
 * @param {number} units - Number of fund units held
 * @param {number} netValue - Current net value of the fund
 * @returns {number} Current value of fund shares
 */
function calculateHoldingValue(units, netValue) {
  const safeUnits = safeParseFloat(units);
  const safeNetValue = safeParseFloat(netValue);
  const result = safeMultiply(safeUnits, safeNetValue);
  
  return result;
}

/**
 * Calculate daily profit/loss
 * @param {number} units - Number of fund units held
 * @param {number} currentNetValue - Current day's net value
 * @param {number} previousNetValue - Previous day's net value
 * @returns {number} Daily profit/loss
 */
function calculateDailyPL(units, currentNetValue, previousNetValue) {
  return units * (currentNetValue - previousNetValue);
}

/**
 * Calculate total profit/loss
 * @param {number} units - Number of fund units held
 * @param {number} currentNetValue - Current net value
 * @param {number} purchaseNetValue - Net value at purchase
 * @returns {number} Total profit/loss
 */
function calculateTotalPL(units, currentNetValue, purchaseNetValue) {
  return units * (currentNetValue - purchaseNetValue);
}

/**
 * Calculate profit/loss percentage
 * @param {number} currentValue - Current value
 * @param {number} initialValue - Initial investment value
 * @returns {number} Profit/loss percentage
 */
function calculatePLPercentage(currentValue, initialValue) {
  if (initialValue === 0) return 0;
  return ((currentValue - initialValue) / initialValue) * 100;
}

/**
 * Format currency for display
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount) {
  return amount.toFixed(2);
}

/**
 * Format percentage for display
 * @param {number} percentage - Percentage to format
 * @returns {string} Formatted percentage string
 */
function formatPercentage(percentage) {
  return percentage.toFixed(2) + '%';
}

/**
 * 从基金数据获取当前净值
 * @param {Array} fundData - 基金数据数组
 * @param {number} currentIndex - 当前索引
 * @returns {number} 当前净值
 */
function getCurrentNetValue(fundData, currentIndex) {
  if (!fundData || fundData.length === 0) {
    return 1.0; // 默认净值
  }
  
  if (currentIndex < 0 || currentIndex >= fundData.length) {
    return 1.0; // 默认净值
  }
  
  const currentData = fundData[currentIndex];
  
  // 如果有 netValue 字段，直接使用
  if (currentData.netValue !== undefined) {
    return parseFloat(currentData.netValue);
  }
  
  // 如果有 indexValue 字段，计算净值
  if (currentData.indexValue !== undefined) {
    return parseFloat(currentData.indexValue) / 1000;
  }
  
  return 1.0; // 默认净值
}

/**
 * 根据交易记录计算持仓份额
 * @param {Array} transactions - 交易记录数组
 * @returns {number} 当前持仓份额
 */
function calculateFundUnitsFromTransactions(transactions) {
  let totalUnits = 0;
  
  transactions.forEach((transaction) => {
    // 计算每笔交易的份额
    const units = calculateUnitsFromRecord(transaction);
    
    if (transaction.type === 'buy') {
      totalUnits += units; // 累加买入份额
    } else if (transaction.type === 'sell') {
      totalUnits -= units; // 减去卖出份额
    }
  });
  
  return Math.max(0, totalUnits); // 确保不为负数
}

/**
 * 计算收益信息
 * @param {Array} tradingHistory - 交易历史
 * @param {number} currentUnits - 当前持仓份额
 * @param {number} currentNetValue - 当前净值
 * @returns {Object} 包含各种收益计算结果的对象
 */
function calculateProfits(tradingHistory, currentUnits, currentNetValue) {
  // 输入参数安全转换，计算过程保持高精度
  const currentUnits_input = safeParseFloat(currentUnits);
  const currentNetValue_input = safeParseFloat(currentNetValue);
  
  // 初始化累计值，使用高精度计算
  let totalBuyAmount = 0;
  let totalSellAmount = 0;
  let totalBuyUnits = 0;
  let totalSellUnits = 0;
  
  // 遍历交易历史，使用高精度运算
  if (tradingHistory && tradingHistory.length > 0) {
    tradingHistory.forEach((record) => {
      if (record.type === 'buy') {
        const buyAmount = safeParseFloat(record.amount);
        const buyUnits = safeParseFloat(record.units);
        totalBuyAmount = safeAdd(totalBuyAmount, buyAmount);
        totalBuyUnits = safeAdd(totalBuyUnits, buyUnits);
      } else if (record.type === 'sell') {
        const sellAmount = safeParseFloat(record.amount);
        const sellUnits = safeParseFloat(record.units);
        totalSellAmount = safeAdd(totalSellAmount, sellAmount);
        totalSellUnits = safeAdd(totalSellUnits, sellUnits);
      }
    });
  }
  
  const netInvestment = safeSubtract(totalBuyAmount, totalSellAmount);
  const remainingUnits = safeSubtract(totalBuyUnits, totalSellUnits);
  const avgCost = remainingUnits > 0 ? safeDivide(netInvestment, remainingUnits) : 0;
  
  // 计算持仓收益（保持高精度）
  const currentHoldingValue = safeMultiply(currentUnits_input, currentNetValue_input);
  const holdingProfit = safeSubtract(currentHoldingValue, safeMultiply(currentUnits_input, avgCost));
  
  // 计算持仓收益率（保持高精度）
  const holdingCost = safeMultiply(currentUnits_input, avgCost);
  const holdingProfitRate = holdingCost > 0 ? safeMultiply(safeDivide(holdingProfit, holdingCost), 100) : 0;
  
  // 计算累计收益率（保持高精度）
  const cumulativeProfitRate = GAME_CONFIG.INITIAL_CASH > 0 ? 
    safeMultiply(safeDivide(safeSubtract(currentHoldingValue, GAME_CONFIG.INITIAL_CASH), GAME_CONFIG.INITIAL_CASH), 100) : 0;
  
  // 返回结果：原始高精度数据 + 格式化显示数据
  return {
    // 原始高精度数据（用于计算和精确存储）
    totalProfit_raw: unifiedPreciseRound(holdingProfit, 'MONEY'),
    profitRate_raw: unifiedPreciseRound(holdingProfitRate, 'PERCENTAGE'),
    totalProfitRate_raw: unifiedPreciseRound(cumulativeProfitRate, 'PERCENTAGE'),
    avgCost_raw: unifiedPreciseRound(avgCost, 'NET_VALUE'),

    // 格式化显示数据（用于UI显示）
    totalProfit_display: formatCurrency(holdingProfit),
    profitRate_display: formatPercentage(holdingProfitRate),
    totalProfitRate_display: formatPercentage(cumulativeProfitRate),
    avgCost_display: formatCurrency(avgCost)
  };
}

/**
 * 统一精度处理函数
 * @param {number} value - 原始值
 * @param {string|number} type - 精度类型或小数位数
 * @returns {number} 精度处理后的值
 */
function unifiedPreciseRound(value, type = 'MONEY') {
  if (typeof type === 'string') {
    const decimals = PRECISION_CONFIG[type];
    if (decimals === -1) return value; // 计算过程不舍入
    return preciseRound(value, decimals);
  } else {
    // 直接传入小数位数
    return preciseRound(value, type);
  }
}

/**
 * 改进的精度处理函数
 * @param {number} value - 原始值
 * @param {number} decimals - 保留小数位数
 * @returns {number} 精度处理后的值
 */
function preciseRound(value, decimals = 2) {
  if (isNaN(value) || value === null || value === undefined) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * 高精度数学运算函数 - 计算过程保持最高精度，不进行中间舍入
 */

/**
 * 高精度加法 - 计算过程不舍入
 * @param {number} a 
 * @param {number} b 
 * @returns {number} 高精度加法结果
 */
function safeAdd(a, b) {
  return Number(a) + Number(b);
}

/**
 * 高精度减法 - 计算过程不舍入
 * @param {number} a 
 * @param {number} b 
 * @returns {number} 高精度减法结果
 */
function safeSubtract(a, b) {
  return Number(a) - Number(b);
}

/**
 * 高精度乘法 - 计算过程不舍入
 * @param {number} a 
 * @param {number} b 
 * @returns {number} 高精度乘法结果
 */
function safeMultiply(a, b) {
  return Number(a) * Number(b);
}

/**
 * 高精度除法 - 计算过程不舍入
 * @param {number} a 
 * @param {number} b 
 * @returns {number} 高精度除法结果
 */
function safeDivide(a, b) {
  if (Math.abs(Number(b)) < 1e-10) return 0; // 防止除零
  return Number(a) / Number(b);
}

/**
 * 计算用户真实总资产（用于排名页面）
 * @param {Object} userData - 标准格式的用户数据
 * @param {Array} indexData - 基金净值数据（可选，用于获取当前净值）
 * @returns {number} 总资产
 */
function calculateRealTotalAssets(userData, indexData = null) {
  if (!userData) {
    return 0;
  }

  // 现金资产（动态计算） - 移动import到函数内部避免循环依赖
  const { calculateAvailableCash } = require('./dataStructureUtils.js');
  const cash = safeParseFloat(calculateAvailableCash(userData, indexData));

  // 基金市值（从标准数据结构计算）
  const fundValue = calculateHoldingValueFromStandardData(userData, indexData);

  // 总资产 = 现金 + 基金市值
  return cash + fundValue;
}

/**
 * 计算总资产（简化版本，直接传入参数，用于投资页面）
 * @param {number} cash - 现金
 * @param {number} fundUnits - 基金份额
 * @param {number} currentNetValue - 当前净值
 * @returns {number} 总资产（应用精度标准）
 */
function calculateTotalAssets(cash, fundUnits, currentNetValue) {
  const cashAmount = safeParseFloat(cash);
  const units = safeParseFloat(fundUnits);
  const netValue = safeParseFloat(currentNetValue, 1.0);
  
  // 高精度计算，不进行中间舍入
  const fundValue = safeMultiply(units, netValue);
  const totalAssets = safeAdd(cashAmount, fundValue);
  
  // 最终输出时进行精度处理
  return unifiedPreciseRound(totalAssets, 'MONEY');
}

/**
 * 计算持仓市值（基于标准用户数据）
 * @param {Object} userData - 标准格式的用户数据
 * @param {Array} indexData - 基金净值数据（可选）
 * @returns {number} 持仓市值
 */
function calculateHoldingValueFromStandardData(userData, indexData = null) {
  if (!userData || !userData.fundData || userData.fundData.length === 0) {
    return 0;
  }
  
  const currentIndex = userData.currentIndex || 0;
  const fundInfo = userData.fundData[0]; // 取第一只基金
  
  // 获取当前净值
  const currentNetValue = getCurrentNetValue(indexData, currentIndex);
  
  // 使用标准结构中的份额数据
  const fundUnits = safeParseFloat(fundInfo.shares);
  
  // 计算持仓市值（保持高精度，最终输出时自然进行精度处理）
  const holdingValue = safeMultiply(fundUnits, currentNetValue);
  
  return holdingValue;
}

/**
 * 临时计算函数：从交易历史计算买入卖出总额（用于日志系统）
 * @param {Array} tradingHistory - 交易历史记录
 * @returns {Object} 包含总买入、总卖出、已实现收益的对象
 */
function calculateTransactionSummary(tradingHistory) {
  let totalBuyAmount = 0;
  let totalSellAmount = 0;
  let totalBuyUnits = 0;
  let totalSellUnits = 0;
  
  if (tradingHistory && tradingHistory.length > 0) {
    tradingHistory.forEach((record) => {
      if (record.type === 'buy') {
        const buyAmount = safeParseFloat(record.amount);
        const buyUnits = safeParseFloat(record.units);
        totalBuyAmount = safeAdd(totalBuyAmount, buyAmount);
        totalBuyUnits = safeAdd(totalBuyUnits, buyUnits);
      } else if (record.type === 'sell') {
        const sellAmount = safeParseFloat(record.amount);
        const sellUnits = safeParseFloat(record.units);
        totalSellAmount = safeAdd(totalSellAmount, sellAmount);
        totalSellUnits = safeAdd(totalSellUnits, sellUnits);
      }
    });
  }
  
  const netInvestment = safeSubtract(totalBuyAmount, totalSellAmount);
  const remainingUnits = safeSubtract(totalBuyUnits, totalSellUnits);
  const avgCost = remainingUnits > 0 ? safeDivide(netInvestment, remainingUnits) : 0;
  
  // 已实现收益 = 总卖出收入 - 总卖出份额 * 平均成本
  const realizedProfit = totalSellUnits > 0 && totalBuyAmount > 0 ? 
    safeSubtract(totalSellAmount, safeMultiply(totalSellUnits, safeDivide(totalBuyAmount, totalBuyUnits))) : 0;
  
  return {
    totalBuyAmount: totalBuyAmount,
    totalSellAmount: totalSellAmount,
    totalBuyUnits: totalBuyUnits,
    totalSellUnits: totalSellUnits,
    netInvestment: netInvestment,
    realizedProfit: realizedProfit
  };
}

/**
 * 计算累计收益率
 * @param {number} totalAssets - 当前总资产
 * @param {number} initialCash - 初始资金
 * @returns {number} 累计收益率百分比
 */
function calculateTotalProfitRate(totalAssets, initialCash) {
  if (initialCash === 0) {
    return 0;
  }
  const difference = safeSubtract(totalAssets, initialCash);
  const rate = safeDivide(difference, initialCash);
  return safeMultiply(rate, 100);
}

/**
 * 计算当前持仓周期的交易汇总（用于改进的方案2）
 * 根据用户规则："清仓后需要将累计买入/卖出金额归零，下个持仓周期重新累加"
 * 
 * 逻辑：
 * 1. 从交易记录的最后往前查找，找到最后一次清仓的时间点
 * 2. 清仓的标识：卖出后剩余份额为0（或接近0）
 * 3. 只统计清仓后的交易记录
 * 4. 如果从未清仓，则统计所有交易记录
 * 
 * @param {Array} tradingHistory - 交易历史记录
 * @param {number} currentFundUnits - 当前持仓份额
 * @returns {Object} 包含当前持仓周期的总买入、总卖出金额
 */
function calculateCurrentPeriodSummary(tradingHistory, currentFundUnits = 0) {
  if (!tradingHistory || tradingHistory.length === 0) {
    return {
      totalBuyAmount: 0,
      totalSellAmount: 0,
      totalBuyUnits: 0,
      totalSellUnits: 0
    };
  }

  let startIndex = 0; // 当前持仓周期的开始索引
  
  // 无论当前是否有持仓，都需要查找最后一次清仓的时间点
  // 模拟重放交易记录，找到最后一次清仓后的起始点
  let simulatedUnits = 0;
  
  for (let i = 0; i < tradingHistory.length; i++) {
    const transaction = tradingHistory[i];
    
    if (transaction.type === 'buy') {
      simulatedUnits += safeParseFloat(transaction.units);
    } else if (transaction.type === 'sell') {
      simulatedUnits -= safeParseFloat(transaction.units);
      
      // 如果卖出后份额为0或接近0，说明发生了清仓
      if (simulatedUnits < 0.01) {
        simulatedUnits = 0;
        startIndex = i + 1; // 从下一个交易开始是新的持仓周期
      }
    }
  }
  
  // 统计从startIndex开始的交易
  let totalBuyAmount = 0;
  let totalSellAmount = 0;
  let totalBuyUnits = 0;
  let totalSellUnits = 0;
  
  for (let i = startIndex; i < tradingHistory.length; i++) {
    const transaction = tradingHistory[i];
    
    if (transaction.type === 'buy') {
      const buyAmount = safeParseFloat(transaction.amount);
      const buyUnits = safeParseFloat(transaction.units);
      totalBuyAmount = safeAdd(totalBuyAmount, buyAmount);
      totalBuyUnits = safeAdd(totalBuyUnits, buyUnits);
    } else if (transaction.type === 'sell') {
      const sellAmount = safeParseFloat(transaction.amount);
      const sellUnits = safeParseFloat(transaction.units);
      totalSellAmount = safeAdd(totalSellAmount, sellAmount);
      totalSellUnits = safeAdd(totalSellUnits, sellUnits);
    }
  }
  
  return {
    totalBuyAmount: totalBuyAmount,
    totalSellAmount: totalSellAmount,
    totalBuyUnits: totalBuyUnits,
    totalSellUnits: totalSellUnits
  };
}

/**
 * 计算累计收益率（按用户规则）
 * 用户规则：累计收益率 = 累计净收益 / 历史买入总金额 × 100
 * 其中：累计净收益 = (当前基金市值 + 历史卖出总金额) - 历史买入总金额
 * 
 * @param {number} currentFundValue - 当前基金市值
 * @param {number} totalBuyAmount - 历史买入总金额
 * @param {number} totalSellAmount - 历史卖出总金额
 * @returns {number} 累计收益率百分比
 */
function calculateCumulativeProfitRate(currentFundValue, totalBuyAmount, totalSellAmount) {
  if (totalBuyAmount === 0) {
    return 0;
  }
  
  // 累计净收益 = (当前基金市值 + 历史卖出总金额) - 历史买入总金额
  const cumulativeNetProfit = safeAdd(currentFundValue, totalSellAmount) - totalBuyAmount;
  
  // 累计收益率 = 累计净收益 / 历史买入总金额 × 100
  const rate = safeDivide(cumulativeNetProfit, totalBuyAmount);
  return safeMultiply(rate, 100);
}

// 导出所有函数和常量
module.exports = {
  // 精度处理常量和函数
  PRECISION_CONFIG,
  unifiedPreciseRound,
  preciseRound,
  safeAdd,
  safeSubtract,
  safeMultiply,
  safeDivide,
  safeParseFloat,
  
  // 核心计算函数
  calculatePurchaseUnits,
  calculateHoldingValue,
  calculateProfits,
  calculateTotalAssets,
  calculateTransactionSummary,
  
  // 工具函数
  calculateDailyPL,
  calculateTotalPL,
  calculatePLPercentage,
  formatCurrency,
  formatPercentage,
  getCurrentNetValue,
  calculateFundUnitsFromTransactions,
  calculateRealTotalAssets,
  calculateHoldingValueFromStandardData,
  calculateUnitsFromRecord,
  calculateTotalProfitRate,
  calculateCurrentPeriodSummary,
  calculateCumulativeProfitRate
}; 