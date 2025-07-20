/**
 * 游戏状态管理器 - 前端统一计算引擎
 * 负责所有游戏逻辑计算，云端只负责数据持久化
 */
const fundUtils = require('./fundUtils.js')
const { extractCalculationData, updateStandardUserData } = require('./dataStructureUtils.js');
const { calculateTotalProfitRate } = fundUtils;

class GameStateManager {
  constructor() {
    this.gameState = {
      // 基础信息
      currentIndex: 29,
      initialIndex: 29,
      
      // 资产信息
      cash: 10000,
      fundUnits: 0,
      
      // 交易记录
      transactions: [],
      
      // 计算字段（实时计算）
      fundValue: 0,
      totalAssets: 10000,
      totalProfit: 0,
      profitRate: 0,
      totalProfitRate: 0,
      avgCost: 0,
      
      // 元数据
      lastSyncTime: null,
      version: 1,
      needsSync: false
    };
    
    this.fundData = null; // 净值数据
    this.syncQueue = []; // 待同步数据队列
  }

  /**
   * 初始化
   */
  async initialize(fundData, userData = null) {
    // 设置基金数据
    if (fundData) {
      this.fundData = fundData;
    }

    // 如果提供了用户数据，从标准数据结构初始化
    if (userData) {
      const calcData = extractCalculationData(userData);
      
      this.gameState = {
        ...this.gameState,
        ...calcData
      };
      // 确保transactions是有效数据
      if (!Array.isArray(this.gameState.transactions)) {
        this.gameState.transactions = [];
      }
    } else {
      // 尝试从本地恢复状态
      const localState = wx.getStorageSync('gameState');
      if (localState && this.isValidState(localState)) {
        this.gameState = { ...this.gameState, ...localState };
        // 确保transactions是有效数据
        if (!Array.isArray(this.gameState.transactions)) {
          this.gameState.transactions = [];
        }
      } else {
        // 从云端恢复
        await this.loadFromCloud();
      }
    }

    this.recalculateAll();
    
    // 标记为需要同步
    this.gameState.needsSync = true;
  }

  /**
   * 统一的交易处理函数
   * @param {string} type 交易类型 'buy' 或 'sell'
   * @param {number} amount 买入金额或卖出份额
   * @returns {Object} 交易结果
   */
  executeTransaction(type, amount) {
    const currentNetValue = this.getCurrentNetValue();
    
    if (type === 'buy') {
      return this.processBuyTransaction(amount, currentNetValue);
    } else if (type === 'sell') {
      return this.processSellTransaction(amount, currentNetValue);
    } else {
      throw new Error('无效的交易类型');
    }
  }

  /**
   * 处理买入交易
   */
  processBuyTransaction(amount, currentNetValue) {
    // 验证资金充足
    if (amount > this.gameState.cash) {
      throw new Error('资金不足');
    }
    
    // 计算新的份额
    const newUnits = fundUtils.calculatePurchaseUnits(amount, currentNetValue);
    
    // 创建交易记录
    const transaction = this.createTransactionRecord('buy', amount, newUnits, currentNetValue);
    
    // 更新状态
    this.updateStateAfterTransaction('buy', amount, newUnits);
    
    const result = {
      success: true,
      newCash: this.gameState.cash,
      newFundUnits: this.gameState.fundUnits,
      totalAssets: this.gameState.totalAssets,
      transaction: transaction
    };
    
    return result;
  }

  /**
   * 处理卖出交易
   */
  processSellTransaction(units, currentNetValue) {
    // 验证份额充足
    if (units > this.gameState.fundUnits) {
      throw new Error('份额不足');
    }
    
    // 计算卖出金额
    const sellAmount = fundUtils.calculateHoldingValue(units, currentNetValue);
    
    // 计算卖出前的已实现收益
    const realizedGain = this.calculateRealizedGainBeforeSale(units, currentNetValue);
    
    // 创建交易记录
    const transaction = this.createTransactionRecord('sell', sellAmount, units, currentNetValue);
    
    // 更新状态
    this.updateStateAfterTransaction('sell', sellAmount, units);
    
    const result = {
      success: true,
      newCash: this.gameState.cash,
      newFundUnits: this.gameState.fundUnits,
      totalAssets: this.gameState.totalAssets,
      realizedGain: realizedGain,
      transaction: transaction
    };
    
    return result;
  }

  /**
   * 创建交易记录
   */
  createTransactionRecord(type, amount, units, price) {
    const transaction = {
      type: type,
      amount: amount,
      units: units,
      price: price,
      date: this.getCurrentDate(),
      timestamp: Date.now()
    };
    
    this.gameState.transactions.push(transaction);
    return transaction;
  }

  /**
   * 更新交易后的状态
   */
  updateStateAfterTransaction(type, amount, units) {
    if (type === 'buy') {
      this.gameState.cash -= amount;
      this.gameState.fundUnits += units;
    } else if (type === 'sell') {
      this.gameState.cash += amount;
      this.gameState.fundUnits -= units;
      // 清仓处理
      if (this.gameState.fundUnits < 0.01) {
        this.gameState.fundUnits = 0;
      }
    }
    // 统一的交易后处理
    this.postTransactionProcessing();
  }

  /**
   * 计算卖出前的已实现收益
   */
  calculateRealizedGainBeforeSale(units, currentNetValue) {
    if (this.gameState.transactions.length === 0) {
      return 0;
    }
    
    const summary = fundUtils.calculateTransactionSummary(this.gameState.transactions);
    const avgCost = summary.netInvestment > 0 && (summary.totalBuyUnits - summary.totalSellUnits) > 0 
      ? summary.netInvestment / (summary.totalBuyUnits - summary.totalSellUnits) 
      : currentNetValue;
    
    return (currentNetValue - avgCost) * units;
  }

  /**
   * 执行买入交易（简化接口）
   */
  async buyFund(amount) {
    try {
      const result = this.executeTransaction('buy', amount);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 执行卖出交易（简化接口）
   */
  async sellFund(units) {
    try {
      const result = this.executeTransaction('sell', units);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 进入下一个交易日
   */
  async nextDay() {
    // 更新游戏进度
    this.gameState.currentIndex++;
    
    // 执行交易后处理
    this.postTransactionProcessing();
    
    // 关键：每个交易日结束时自动同步到云端
    await this.syncToCloud();
    
    return {
      success: true,
      currentIndex: this.gameState.currentIndex,
      totalAssets: this.gameState.totalAssets,
      dailyChange: this.calculateDailyChange()
    };
  }

  /**
   * 统一的交易后处理 - 消除重复代码
   */
  postTransactionProcessing() {
    // 重新计算所有衍生数据
    this.recalculateAll();
    
    // 标记需要同步
    this.markNeedsSync();
    
    // 保存到本地
    this.saveToLocal();
  }

  /**
   * 重新计算所有数据
   */
  recalculateAll() {
    const oldState = { ...this.gameState };
    const currentNetValue = this.getCurrentNetValue();

    // 1. 更新基金市值
    this.gameState.fundValue = fundUtils.calculateHoldingValue(this.gameState.fundUnits, currentNetValue);
    
    // 2. 【方案1】强制同步：总资产必须等于现金 + 基金市值
    this.gameState.totalAssets = this.gameState.cash + this.gameState.fundValue;

    // 3. 重新计算收益指标
    this.calculateProfitMetrics();

    // 4. 重新计算日收益
    this.calculateDailyProfit();

    // 5. 更新当前净值和日涨跌幅
    this.gameState.currentNetValue = currentNetValue;
    this.gameState.dailyChange = this.calculateDailyChange();

    // 6. 标记为需要同步
    this.gameState.needsSync = true;
  }

  /**
   * 重新计算收益相关指标（持仓收益，累计收益，平均成本）
   */
  calculateProfitMetrics() {
    const initialCash = 10000; // 初始资金，通常为固定值

    if (this.gameState.transactions.length === 0) {
      // 没有交易时，所有收益指标均为0
      this.gameState.totalProfit = 0;
      this.gameState.holdingProfit = 0;
      this.gameState.realizedProfit = 0;
      this.gameState.profitRate = 0;
      // 【修复】没有交易时使用简单的 totalAssets - initialCash 计算累计收益率
      this.gameState.totalProfitRate = fundUtils.calculateTotalProfitRate(this.gameState.totalAssets, initialCash);
      this.gameState.avgCost = 0;
      return;
    }

    // 1. 获取当前持仓周期的累计金额（用于持仓成本计算，清仓后归零）
    const currentPeriodSummary = fundUtils.calculateCurrentPeriodSummary(
      this.gameState.transactions, 
      this.gameState.fundUnits
    );
    
    // 2. 获取所有历史交易的累计金额（用于累计收益率计算，不清零）
    const historicalSummary = fundUtils.calculateTransactionSummary(this.gameState.transactions);
    
    // 计算已实现收益
    const realizedProfit = historicalSummary.realizedProfit;

    // 计算当前持仓价值
    const currentHoldingValue = this.gameState.fundValue;

    // 计算持仓成本 (使用当前持仓周期的累计值，清仓后归零)
    const currentFundUnits = this.gameState.fundUnits;
    let avgCost = 0;
    if (currentFundUnits > 0) {
      const netBuyAmount = currentPeriodSummary.totalBuyAmount - currentPeriodSummary.totalSellAmount; // 当前周期净买入金额
      avgCost = netBuyAmount > 0 ? netBuyAmount / currentFundUnits : 0;
    }
    this.gameState.avgCost = avgCost;

    // 计算持仓收益 (未实现收益) - 按用户规则
    const holdingProfit = currentFundUnits * (this.getCurrentNetValue() - avgCost);
    
    // 计算总收益（持仓收益 + 已实现收益）
    const totalProfit = holdingProfit + realizedProfit;

    // 计算持仓收益率
    let profitRate = 0;
    if (currentFundUnits > 0 && avgCost > 0) {
      profitRate = (holdingProfit / (currentFundUnits * avgCost)) * 100;
    }
    this.gameState.profitRate = profitRate;
    
    // 【修复】累计收益率计算：如果有历史交易则使用交易数据，否则使用总资产差额
    if (historicalSummary.totalBuyAmount > 0) {
      this.gameState.totalProfitRate = fundUtils.calculateCumulativeProfitRate(
        this.gameState.fundValue,
        historicalSummary.totalBuyAmount,
        historicalSummary.totalSellAmount
      );
    } else {
      // 没有交易或交易金额为0时，使用简单的总资产差额计算
      this.gameState.totalProfitRate = fundUtils.calculateTotalProfitRate(this.gameState.totalAssets, initialCash);
    }

    // 更新各种收益数据
    this.gameState.holdingProfit = holdingProfit;
    this.gameState.realizedProfit = realizedProfit;
    this.gameState.totalProfit = totalProfit;
  }

  /**
   * 计算当日盈亏
   * 当日盈亏 = 今日市值 - 昨日市值
   * 考虑现金流，但日收益不应影响现金余额
   */
  calculateDailyProfit() {
    const currentIndex = this.gameState.currentIndex;
    const initialIndex = this.gameState.initialIndex;

    if (currentIndex <= initialIndex || !this.fundData || this.fundData.length === 0) {
      this.gameState.dailyProfit = 0;
      return;
    }

    const currentDayData = this.fundData[currentIndex];
    const yesterdayData = this.fundData[currentIndex - 1];

    if (!currentDayData || !yesterdayData) {
      this.gameState.dailyProfit = 0;
      return;
    }

    const yesterdayNetValue = yesterdayData.netValue;
    const currentNetValue = currentDayData.netValue;

    // 计算基金份额当日的价值变动
    const fundUnits = this.gameState.fundUnits;
    const dailyChangeInFundValue = (currentNetValue - yesterdayNetValue) * fundUnits;
    
    // 当日盈亏
    this.gameState.dailyProfit = dailyChangeInFundValue;
  }

  /**
   * 计算日涨跌幅
   */
  calculateDailyChange() {
    if (!this.fundData || this.gameState.currentIndex >= this.fundData.length) {
      return 0;
    }
    
    const currentData = this.fundData[this.gameState.currentIndex];
    return currentData ? currentData.dailyChange : 0;
  }

  /**
   * 获取当前净值
   */
  getCurrentNetValue() {
    if (!this.fundData || this.gameState.currentIndex >= this.fundData.length) {
      return 1;
    }
    
    const currentData = this.fundData[this.gameState.currentIndex];
    return currentData ? currentData.netValue : 1;
  }

  /**
   * 获取当前日期
   */
  getCurrentDate() {
    if (!this.fundData || this.gameState.currentIndex >= this.fundData.length) {
      return new Date().toISOString().slice(0, 10);
    }
    
    const currentData = this.fundData[this.gameState.currentIndex];
    return currentData ? currentData.date : new Date().toISOString().slice(0, 10);
  }

  /**
   * 获取当前状态
   */
  getState() {
    // 动态计算当前持仓周期的累计金额（改进的方案2）
    const currentPeriodSummary = fundUtils.calculateCurrentPeriodSummary(
      this.gameState.transactions, 
      this.gameState.fundUnits
    );
    
    // 计算历史所有交易的累计金额
    const historicalSummary = fundUtils.calculateTransactionSummary(this.gameState.transactions);
    
    return {
      ...this.gameState,
      currentNetValue: this.getCurrentNetValue(),
      dailyChange: this.calculateDailyChange(),
      // 当前持仓周期的累计金额（用于持仓成本计算）
      totalInvested: currentPeriodSummary.totalBuyAmount,
      totalSold: currentPeriodSummary.totalSellAmount,
      // 历史所有交易的累计金额（用于累计收益率计算）
      historicalInvested: historicalSummary.totalBuyAmount,
      historicalSold: historicalSummary.totalSellAmount
    };
  }

  /**
   * 标记需要同步
   */
  markNeedsSync() {
    this.gameState.needsSync = true;
  }

  /**
   * 保存到本地存储
   */
  saveToLocal() {
    try {
      wx.setStorageSync('gameState', this.gameState);
    } catch (error) {
      console.warn('保存游戏状态到本地失败:', error);
    }
  }

  /**
   * 从云端加载
   */
  async loadFromCloud() {
    try {
      // 这里可以添加从云端加载的逻辑
    } catch (error) {
      console.warn('从云端加载游戏状态失败:', error);
    }
  }

  /**
   * 同步到云端
   */
  async syncToCloud() {
    if (!this.gameState.needsSync) {
      return { success: true, message: '数据无变化，无需同步' };
    }

    try {
      // 🔧 关键修复：获取当前完整的用户数据，而不是创建空对象
      const app = getApp();
      const currentUserData = app.globalData.userData || {};
      
      // 基于现有用户数据进行更新，保持完整的数据结构
      const userData = updateStandardUserData(currentUserData, this.gameState);
      
      const result = await wx.cloud.callFunction({
        name: 'userDataManager',
        data: {
          action: 'updateUserData',
          data: userData
        }
      });

      if (result.result && result.result.success) {
        this.gameState.needsSync = false;
        this.gameState.lastSyncTime = Date.now();
        
        // 🔧 重要：同步成功后更新全局用户数据，确保数据一致性
        if (app.globalData.userData) {
          Object.assign(app.globalData.userData, userData);
        }
        
        return { success: true };
      } else {
        throw new Error(result.result?.error || '云端同步失败');
      }
    } catch (error) {
      console.warn('GameStateManager云端同步失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 验证状态有效性
   */
  isValidState(state) {
    return state && 
           typeof state.cash === 'number' && 
           typeof state.fundUnits === 'number' &&
           typeof state.currentIndex === 'number' &&
           Array.isArray(state.transactions);
  }
}

module.exports = GameStateManager; 