// pages/fund/fund.js
// 架构说明：已彻底移除乐观更新机制，所有状态更新完全基于GameStateManager的最终计算结果
import * as echarts from '../../ec-canvas/echarts';
const { indexData } = require('../../data/index_data.js');
const fundUtils = require('../../utils/fundUtils.js');
const { safeParseFloat } = fundUtils; // 引入safeParseFloat
const assetLogger = require('../../utils/assetLogger.js');
const userActionTracker = require('../../utils/userActionTracker.js');
const performanceMonitor = require('../../utils/performanceMonitor.js');
const gameUtils = require('../../utils/gameUtils.js');
const GAME_CONFIG = require('../../config/gameConfig.js');
const GameStateManager = require('../../utils/gameStateManager.js');

/**
 * 获取设备像素比的统一方法
 */
function getDevicePixelRatio(dpr) {
  try {
    // 优先使用传入的dpr参数（来自ec-canvas组件）
    if (dpr && dpr > 0) {
      return dpr;
    }

    // 真机优化：多重获取方案
    const systemInfo = wx.getSystemInfoSync();
    if (systemInfo.pixelRatio && systemInfo.pixelRatio > 0) {
      return systemInfo.pixelRatio;
    }

    const deviceInfo = wx.getDeviceInfo();
    if (deviceInfo.pixelRatio && deviceInfo.pixelRatio > 0) {
      return deviceInfo.pixelRatio;
    }

    // 使用优化后的默认值
    return 2.75;
  } catch (e) {
    console.warn('获取设备像素比失败，使用默认值2.75:', e);
    return 2.75;
  }
}

/**
 * 数据格式化函数 - 将原始数据格式化为前端显示用的字符串
 * 目的：保证前端显示与后端数据完全隔离，原始数据保持高精度
 */
function formatDataForDisplay(rawData) {
  const { unifiedPreciseRound, PRECISION_CONFIG } = fundUtils;

  // 统一的格式化函数，使用精度标准
  const formatMoney = (value) => {
    const result = unifiedPreciseRound(fundUtils.safeParseFloat(value), 'MONEY').toFixed(PRECISION_CONFIG.MONEY);
    return result;
  };

  const formatPercent = (value) => {
    const num = unifiedPreciseRound(fundUtils.safeParseFloat(value), 'PERCENTAGE');
    const sign = num >= 0 ? '+' : '';
    const result = sign + num.toFixed(PRECISION_CONFIG.PERCENTAGE) + '%';
    return result;
  };

  const formatShares = (value) => {
    return unifiedPreciseRound(fundUtils.safeParseFloat(value), 'UNITS').toFixed(PRECISION_CONFIG.UNITS);
  };

  const formatNetValue = (value) => {
    return unifiedPreciseRound(fundUtils.safeParseFloat(value), 'NET_VALUE').toFixed(PRECISION_CONFIG.NET_VALUE);
  };

  return {
    // 使用统一精度标准的格式化函数
    cash: formatMoney(rawData.cash),
    fundValue: formatMoney(rawData.fundValue),
    totalAmount: formatMoney(rawData.totalAmount),
    dailyProfit: formatMoney(rawData.dailyProfit),
    totalProfit: formatMoney(rawData.holdingProfit), // 修改：使用holdingProfit替代totalProfit
    currentNetValue: formatNetValue(rawData.currentNetValue),
    avgCost: formatNetValue(rawData.avgCost),
    fundUnits: formatShares(rawData.fundUnits),
    dailyChange: formatPercent(rawData.dailyChange),
    profitRate: formatPercent(rawData.profitRate),
    totalProfitRate: formatPercent(rawData.totalProfitRate)
  };
}

// 定义图表初始化函数
function initChart(canvas, width, height, dpr) {
  // 使用统一的设备像素比获取方法
  const actualDpr = getDevicePixelRatio(dpr);

  const chart = echarts.init(canvas, null, {
    width: width,
    height: height,
    devicePixelRatio: actualDpr, // 使用实际设备像素比，解决模糊问题
    renderer: 'canvas', // 明确指定使用canvas渲染器
    useDirtyRect: false // 真机优化：禁用脏矩形优化以确保渲染质量
  });
  canvas.setChart(chart);

  // 不设置初始选项，避免覆盖正确的数据
  // 让updateChart方法来设置完整的图表选项
  return chart;
}



Page({
  /**
   * 监控chartData变化的通用方法
   */
  _trackChartDataChange: function (source, oldData, newData) {
    // 记录到历史中
    this.data._chartDataHistory.push({
      source,
      oldLength: oldData?.length || 0,
      newLength: newData?.length || 0,
      timestamp: Date.now()
    });

    // 保持历史记录不超过10条
    if (this.data._chartDataHistory.length > 10) {
      this.data._chartDataHistory.shift();
    }
  },

  /**
   * 统一的数字格式化方法
   */
  formatNumberValue: function (value, decimals = 2) {
    const num = parseFloat(value);
    return isNaN(num) ? '0.00' : num.toFixed(decimals);
  },

  /**
   * 统一的游戏结束数据构建方法
   */
  buildGameEndData: function () {
    const { _rawData, tradingHistory, currentIndex } = this.data;
    const { totalAmount, totalProfit, profitRate, totalProfitRate } = _rawData;

    // 计算交易次数
    const tradingCount = tradingHistory ? tradingHistory.length : 0;

    // 计算成就等级
    const achievement = this.calculateAchievement(profitRate, tradingCount);

    // 计算累计投资天数
    const cumulativeInvestmentDays = currentIndex - GAME_CONFIG.INITIAL_INDEX;
    const alternativeInvestmentDays = currentIndex - this.data.initialIndex;

    // 构建游戏数据
    const gameEndData = {
      // 总资产（突出显示）
      finalTotalAmount: this.formatNumberValue(totalAmount, 2),
      // 累计收益率（在总资产旁边小字体显示）
      finalTotalProfitRate: this.formatNumberValue(totalProfitRate, 2),
      // 持仓收益（使用实际的持仓收益，确保与投资页面一致）
      currentRoundProfit: this.formatNumberValue(_rawData.holdingProfit, 2),
      // 持仓收益率（使用实际的持仓收益率）
      currentRoundProfitRate: this.formatNumberValue(profitRate, 2),
      // 交易次数
      tradingCount: tradingCount,
      // 投资天数
      investmentDays: cumulativeInvestmentDays,
      // 成就信息
      achievementLevel: achievement.level,
      achievementIcon: achievement.icon,
      achievementTitle: achievement.title,
      achievementDesc: achievement.desc
    };

    return gameEndData;
  },

  /**
   * 更新显示数据 - 优化版本，减少setData调用
   */
  updateDisplayData: function () {
    const startTime = Date.now();
    const rawData = this.data._rawData;

    const formatted = formatDataForDisplay(rawData);

    // **性能优化：只在数据真正发生变化时才更新**
    const currentDisplay = this.data.displayData;
    let hasChanged = false;

    // 检查关键字段是否变化
    const keyFields = ['cash', 'fundValue', 'totalAmount', 'totalProfit', 'totalProfitRate'];
    for (const field of keyFields) {
      if (currentDisplay[field] !== formatted[field]) {
        hasChanged = true;
        break;
      }
    }

    if (hasChanged) {
      this.setData({
        displayData: formatted
      });

      // 保存当前数据到全局变量，供登录页面"我的战绩"按钮使用
      this.saveCurrentDataToGlobal();
    } else {
    }
  },

  /**
   * 批量更新UI - 减少setData调用次数
   */
  updateUIBatch: function (updateData = {}) {
    const startTime = Date.now();

    // 获取当前状态
    const gameStateManager = this.data.gameStateManager;
    const state = gameStateManager ? gameStateManager.getState() : {};
    const rawData = this.data._rawData;

    // 合并所有需要更新的数据
    const batchUpdate = {
      // 基础数据更新
      ...updateData,

      // 显示数据更新
      displayData: formatDataForDisplay(rawData),

      // 状态相关更新
      currentDate: this.data.fundData[state.currentIndex]?.date || this.data.currentDate,
      remainingDays: Math.max(0, this.data.totalTradingDays - this.data.usedGameDays)
    };

    // 单次setData调用
    this.setData(batchUpdate);

    // 保存到全局变量
    this.saveCurrentDataToGlobal();
  },

  /**
   * 保存当前投资页面数据到全局变量
   */
  saveCurrentDataToGlobal: function () {
    const app = getApp();

    // 使用统一的游戏数据构建方法
    const gameEndData = this.buildGameEndData();

    // 保存到全局变量
    app.globalData.currentFundPageData = gameEndData;
  },

  data: {
    // 游戏状态管理器实例
    gameStateManager: null,

    // 调试用：chartData变化监控
    _chartDataHistory: [],

    // CSV日志：记录最后日志日期，防止重复记录
    _lastLoggedDate: null,

    // CSV日志：当前交易信息全局变量
    _currentOperationType: '无操作',
    _currentTransactionAmount: 0,
    _currentTransactionShares: 0,

    // 原始数据 - 用于业务逻辑计算（保持高精度）
    _rawData: {
      totalAmount: GAME_CONFIG.INITIAL_CASH, // Initial total amount
      cash: GAME_CONFIG.INITIAL_CASH,       // Initial cash
      fundValue: 0,       // Initial fund value (0)
      fundUnits: 0,       // Initial fund units (0)
      currentNetValue: 0, // Current net value
      dailyChange: 0,     // Daily percentage change
      dailyProfit: 0,     // Yesterday's profit
      holdingProfit: 0,   // 持仓收益（未实现收益）= 持仓份额 × (当日净值 - 持仓成本)
      realizedProfit: 0,  // 已实现收益（历史卖出的累计收益）
      totalProfit: 0,     // 总收益（持仓收益 + 已实现收益）
      profitRate: 0,      // 持仓收益率 = (当前净值/持仓成本 - 1) × 100%
      totalProfitRate: 0, // 累计收益率 = ((当前基金市值 + 历史卖出总金额) - 历史买入总金额) / 历史买入总金额 × 100%
      avgCost: 0,         // 持仓成本（摊薄成本法计算）
    },

    // 格式化后的显示数据 - 用于前端展示（格式化字符串）
    displayData: {
      cash: GAME_CONFIG.INITIAL_CASH.toFixed(2),
      fundValue: '0.00',
      totalAmount: GAME_CONFIG.INITIAL_CASH.toFixed(2),
      dailyProfit: '0.00',
      totalProfit: '0.00',
      currentNetValue: '0.0000',
      avgCost: '0.0000',
      fundUnits: '0.00',
      dailyChange: '+0.00%',
      profitRate: '+0.00%',
      totalProfitRate: '+0.00%'
    },

    // Current fund data
    currentIndex: 0,    // Current day index in the data array

    // Trading history
    tradingHistory: [], // Array to store buy/sell actions
    reversedTradingHistory: [], // 反转后的交易记录，最新的在最上方

    // UI control
    showDetails: true, // Controls the collapsible details section

    // Chart data
    chartData: [],      // Data for the performance chart

    // Full data
    fundData: [],       // Processed fund data with net values

    // 时间周期选择
    timePeriod: '1m',   // 默认为1个月

    // ECharts配置
    ec: {
      onInit: initChart
    },

    // 倒计时相关数据
    totalTradingDays: GAME_CONFIG.TOTAL_TRADING_DAYS,    // 游戏总交易日数
    remainingDays: GAME_CONFIG.TOTAL_TRADING_DAYS,       // 剩余交易日数
    remainingDaysText: GAME_CONFIG.TOTAL_TRADING_DAYS.toString(), // 显示文本
    remainingDaysUnit: '天',                             // 显示单位
    remainingDaysLabel: '剩余交易日',                     // 显示标签
    progressPercent: 0,       // 进度百分比
    initialIndex: 0,          // 记录页面初始化时的索引

    // 倒计时动态颜色数据
    countdownBackgroundColor: 'rgb(255, 255, 255)',     // 背景色
    countdownShadowColor: 'rgba(255, 255, 255, 0.3)',   // 阴影色
    countdownTextColor: '#333',                          // 文字颜色
    countdownColorProgress: 0,                           // 颜色进度
    countdownUrgent: false,                              // 紧急状态标识
    countdownProgressBarColor: 'linear-gradient(90deg, #4CAF50, #2196F3)', // 进度条颜色
    countdownProgressBgColor: 'rgba(0, 0, 0, 0.1)',     // 进度条背景色

    // 按钮动画状态
    sellPressed: false,
    nextPressed: false,
    buyPressed: false,

    // 游戏状态
    gameEnded: false,
    showGameResult: false, // 控制游戏结果卡片显示
    showChart: true, // 控制图表显示
    isLastDayCompleted: false, // 新增：表示最后一天已完成，等待分享
    showCompletionButton: false, // 控制"查看投资成果"按钮显示

    // 交易日志系统
    tradingLogs: [],          // 详细交易日志

    // 动态文本配置
    gameTexts: GAME_CONFIG.getText()
  },

  /**
   * 页面加载时执行
   */
  onLoad: function (options) {
    // 设置初始状态
    this.setData({
      gameTexts: GAME_CONFIG.getText()
    });

    // 初始化数据
    this.initializeData()
      .then(() => {
        // 更新图表
        this.updateChart();
        // 初始化反转的交易记录
        this.updateReversedTradingHistory();
      })
      .catch(error => {
        console.error('数据初始化失败:', error);
        wx.showToast({
          title: '数据加载失败',
          icon: 'error'
        });
      });
  },

  /**
   * 检查用户登录状态
   */
  checkUserLogin: function () {
    const app = getApp()
    if (!app.globalData.openid || !app.globalData.userData) {
      // 用户未登录，跳转到登录页面
      wx.showModal({
        title: '提示',
        content: '请先登录以保存您的投资记录',
        showCancel: false,
        success: (res) => {
          if (res.confirm) {
            wx.redirectTo({
              url: '/pages/login/login'
            })
          }
        }
      })
      return false
    }
    return true
  },

  /**
   * 加载用户数据
   */
  loadUserData: async function (forceRefresh = false) {

    const app = getApp()

    // V2架构：直接使用本地数据，不需要频繁的云端获取

    if (!app.globalData.userData) {
      // 延迟500ms后重试，返回promise
      return new Promise((resolve) => {
        setTimeout(() => {
          this.loadUserData(forceRefresh).then(resolve).catch(resolve)
        }, 500)
      })
    }

    if (!this.data.fundData || this.data.fundData.length === 0) {
      // 延迟200ms后重试，返回promise
      return new Promise((resolve) => {
        setTimeout(() => {
          this.loadUserData(forceRefresh).then(resolve).catch(resolve)
        }, 200)
      })
    }

    try {
      const userData = app.globalData.userData

      if (userData) {
        // 使用新的标准数据结构
        const {
          // 3. 游戏状态类字段
          currentIndex = GAME_CONFIG.INITIAL_INDEX,
          initialIndex = GAME_CONFIG.INITIAL_INDEX,
          // 4. 资金管理类字段
          totalAmount = GAME_CONFIG.INITIAL_CASH,
          totalProfitRate = 0,
          // 5. 基金投资类字段
          fundData = []
        } = userData;

        // 从基金数据中提取交易记录和份额
        const fundInfo = fundData.length > 0 ? fundData[0] : { shares: 0, transactions: [] };
        const { shares = 0, transactions = [] } = fundInfo;

        // 动态计算可用现金
        const { calculateAvailableCash } = require('../../utils/dataStructureUtils.js');
        const availableCash = calculateAvailableCash(userData, this.data.fundData);

        const transactionsCount = transactions.length

        // 准备设置的数据
        const dataToSet = {
          currentIndex,
          initialIndex,
          '_rawData.cash': availableCash // 存储为数字
        };

        // 直接使用云端的总资产和累计收益率
        if (totalAmount !== undefined && totalProfitRate !== undefined) {
          dataToSet['_rawData.totalAmount'] = totalAmount;
          dataToSet['_rawData.totalProfitRate'] = totalProfitRate;
        }

        this.setData(dataToSet)

        // 根据currentIndex更新当前净值和日涨跌幅
        if (this.data.fundData && this.data.fundData[currentIndex]) {
          const currentDayData = this.data.fundData[currentIndex];

          this.setData({
            '_rawData.currentNetValue': currentDayData.netValue, // 更新当前净值
            '_rawData.dailyChange': currentDayData.dailyChange,   // 更新日涨跌幅
          });

          // 重新计算图表数据
          const chartData = this.calculateChartDataWindow(currentIndex, this.data.timePeriod);

          this.setData({
            chartData: chartData
          });
        }

        // 更新显示数据
        this.updateDisplayData();

        // 计算基金份额
        if (shares > 0) {
          this.calculateFundUnits({ shares })
        }

        // 检查游戏是否已完成
        const usedGameDays = currentIndex - initialIndex;
        const remaining = Math.max(0, this.data.totalTradingDays - usedGameDays);

        if (remaining <= 0) {
          // 游戏已完成，自动开始新一轮投资挑战
          this.startNewRound(currentIndex);
        } else {
          // 游戏未完成，正常更新倒计时
          const app = getApp();
          const globalCountdown = app.globalData.investmentCountdown;

          // 初始化全局倒计时状态（如果尚未初始化）
          if (globalCountdown.lastUpdateTime === null) {
            globalCountdown.remainingDays = remaining;
            globalCountdown.isGameCompleted = false;
            globalCountdown.lastUpdateTime = Date.now();
          }

          // 更新倒计时
          this.updateCountdown();
        }
      }

      // 重新计算昨日收益
      this.recalculateDailyProfit();

      return Promise.resolve()
    } catch (error) {
      console.error('加载用户数据失败:', error)
      return Promise.reject(error)
    }
  },



  /**
   * 继续投资 - 恢复上次投资状态
   */
  startNewRound: function (currentIndex) {
    const totalDays = this.data.totalTradingDays;

    // 重置全局倒计时状态
    const app = getApp();
    app.globalData.investmentCountdown = {
      remainingDays: totalDays,
      isGameCompleted: false,
      lastUpdateTime: Date.now()
    };

    // 计算显示文本
    let displayText = totalDays > 1 ? `${totalDays}` : (totalDays === 1 ? '最后' : '0');
    let subText = totalDays > 1 ? '个交易日' : (totalDays === 1 ? '1个交易日' : '');

    // 重置UI状态
    this.setData({
      gameEnded: false,
      countdownText: displayText,
      countdownSubText: subText,
      remainingDays: totalDays,
      isGameCompleted: false,
      showContinueButton: false
    });

    // 🔧 修复：使用正确的方法名
    // 计算图表数据
    const chartData = this.calculateChartDataWindow(currentIndex, this.data.timePeriod || '1m');
    this.setData({
      chartData: chartData
    });

    // 恢复投资状态
    this.restoreInvestmentState();
  },

  /**
   * 恢复投资状态（新增方法）
   */
  restoreInvestmentState: function () {
    // 从全局数据恢复投资状态
    const app = getApp();
    const userData = app.globalData.userData;

    if (!userData) {
      console.warn('无法获取用户数据，跳过投资状态恢复');
      return;
    }

    // 🔧 关键修复：创建用户数据的深拷贝，防止被意外修改
    const userDataCopy = JSON.parse(JSON.stringify(userData));

    // 重新初始化GameStateManager
    const gameStateManager = new GameStateManager();

    // 使用用户数据副本进行初始化，保护原始数据
    gameStateManager.initialize(this.data.fundData, userDataCopy).then(() => {
      this.setData({ gameStateManager });

      // 获取最终状态并恢复所有投资数据
      const finalState = gameStateManager.getState();

      this.setData({
        // 恢复投资状态
        '_rawData.cash': finalState.cash,
        '_rawData.fundUnits': finalState.fundUnits,
        '_rawData.fundValue': finalState.fundValue,
        '_rawData.totalAmount': finalState.totalAmount,
        '_rawData.totalProfit': finalState.totalProfit,
        '_rawData.profitRate': finalState.profitRate,
        '_rawData.totalProfitRate': finalState.totalProfitRate,
        '_rawData.avgCost': finalState.avgCost,
        '_rawData.currentNetValue': finalState.currentNetValue,
        '_rawData.dailyChange': finalState.dailyChange,
        '_rawData.dailyProfit': finalState.dailyProfit,

        // 恢复交易记录
        tradingHistory: finalState.transactions,

        // 关键修复：重新设置游戏进度，让新一轮从当前位置开始
        currentIndex: userData.currentIndex,
        initialIndex: userData.currentIndex  // 将当前位置设为新的起始点
      });

      // 同步更新全局用户数据中的initialIndex（但不修改其他数据）
      const app = getApp();
      if (app.globalData.userData) {
        // 🔧 只更新initialIndex，不修改其他数据
        app.globalData.userData.initialIndex = userData.currentIndex;
      }

      // 更新UI显示
      this.updateDisplayData();
      this.updateReversedTradingHistory();
      this.updateCountdown();
    }).catch((error) => {
      console.error('恢复投资状态失败:', error);
    });
  },

  /**
   * 重新计算收益率和总收益 - 完全基于GameStateManager，无乐观更新
   */
  recalculateProfits: function () {
    const gameStateManager = this.data.gameStateManager;
    if (!gameStateManager) {
      // 如果GameStateManager未初始化，延迟重试
      setTimeout(() => {
        this.recalculateProfits();
      }, 100);
      return;
    }

    // 重新计算
    gameStateManager.recalculateAll();

    // 获取最终计算结果并更新页面
    const finalState = gameStateManager.getState();
    this.setData({
      '_rawData.holdingProfit': finalState.holdingProfit,
      '_rawData.realizedProfit': finalState.realizedProfit,
      '_rawData.totalProfit': finalState.totalProfit,
      '_rawData.profitRate': finalState.profitRate,
      '_rawData.totalProfitRate': finalState.totalProfitRate,
      '_rawData.avgCost': finalState.avgCost,
      '_rawData.fundValue': finalState.fundValue,
      '_rawData.totalAmount': finalState.totalAmount
    }, () => {
      this.updateDisplayData();
    });
  },

  /**
   * 重新计算昨日收益 - 完全基于GameStateManager，无乐观更新
   */
  recalculateDailyProfit: function () {
    const gameStateManager = this.data.gameStateManager;
    if (!gameStateManager) {
      console.warn('GameStateManager未初始化，无法计算日收益');
      return;
    }

    // 完全基于GameStateManager的统一计算
    const finalState = gameStateManager.getState();
    const dailyProfit_raw = finalState.dailyProfit || 0;

    this.setData({
      '_rawData.dailyProfit': dailyProfit_raw
    }, () => {
      this.updateDisplayData();
    });
  },



  /**
   * 计算基金份额信息 - 基于最终数据，无乐观更新
   */
  calculateFundUnits: function (fundData) {
    if (fundData && fundData.shares > 0) {
      const shares = safeParseFloat(fundData.shares);
      const currentNetVal = this.data._rawData.currentNetValue;

      // 基于最终确定的数据计算基金市值
      this.setData({
        '_rawData.fundUnits': shares,
        '_rawData.fundValue': shares * currentNetVal
      })
    } else {
      this.setData({
        '_rawData.fundUnits': 0,
        '_rawData.fundValue': 0
      });
    }
  },



  /**
   * 保存交易记录到云端
   */
  /**
   * 标记交易待同步 - 使用GameStateManager的同步机制
   */
  markTransactionForSync: function (transaction) {
    // GameStateManager 内部已经处理交易同步
  },

  /**
   * 同步当前交易日数据到云端 - 使用GameStateManager统一同步
   */
  syncGameDataToCloud: async function () {
    try {
      const gameStateManager = this.data.gameStateManager;
      if (!gameStateManager) {
        throw new Error('GameStateManager 未初始化');
      }

      // 使用GameStateManager的云端同步功能
      const syncResult = await gameStateManager.syncToCloud();

      if (syncResult.success) {
        return { success: true };
      } else {
        // 检查是否是数据无变化的情况
        if (syncResult.message && syncResult.message.includes('数据无变化')) {
          return { success: true };
        }
        throw new Error(syncResult.error || '云端同步失败');
      }
    } catch (error) {
      console.error('交易日数据同步失败:', error);

      // 网络失败时不影响游戏继续，数据会在下次成功时补同步
      wx.showToast({
        title: '数据将稍后同步',
        icon: 'none',
        duration: 1500
      });

      return { success: false, error: error.message };
    }
  },



  // 计算图表数据窗口的公共函数
  calculateChartDataWindow: function (currentIndex, timePeriod) {
    const { fundData } = this.data; // fundData entries have raw netValue

    // 根据时间周期确定天数
    let periodDays = 30; // 默认近1月

    switch (timePeriod) {
      case '3m': periodDays = 90; break;
      case '6m': periodDays = 180; break;
      case '1y': periodDays = 365; break;
      default: periodDays = 30; // 默认近1月
    }

    // 计算窗口起始索引，确保不小于0
    const startIndex = Math.max(0, currentIndex - (periodDays - 1));
    const endIndex = currentIndex;

    // 获取对应时间窗口的数据 - value is raw netValue
    const result = fundData.slice(startIndex, endIndex + 1).map(item => ({
      date: item.date, // string
      value: item.netValue // 原始数字
    }));

    return result;
  },

  // 切换时间周期
  changePeriod: function (e) {
    const period = e.currentTarget.dataset.period;

    if (this.data.timePeriod === period) {
      // 如果点击的是当前选中的周期，不做任何操作
      return;
    }

    // 更新数据和图表
    const newChartData = this.calculateChartDataWindow(this.data.currentIndex, period);

    // 追踪chartData变化
    const oldChartData = this.data.chartData;
    this._trackChartDataChange('changePeriod', oldChartData, newChartData);

    this.setData({
      timePeriod: period,
      chartData: newChartData
    }, () => {
      // 更新图表
      this.updateChartData();
    });
  },

  // 更新图表函数
  updateChart: function () {
    const ecComponent = this.selectComponent('#mychart-dom-fund');
    if (!ecComponent) {
      // 防止无限重试
      this._updateChartRetryCount = (this._updateChartRetryCount || 0) + 1;
      if (this._updateChartRetryCount < 10) {
        setTimeout(() => {
          this.updateChart();
        }, 500);
      } else {
        console.error('updateChart重试次数过多，停止重试');
      }
      return;
    }

    // 重置重试计数
    this._updateChartRetryCount = 0;

    const self = this;
    ecComponent.init((canvas, width, height, dpr) => {
      try {
        // 使用统一的设备像素比获取方法
        const actualDpr = getDevicePixelRatio(dpr);

        const chart = echarts.init(canvas, null, {
          width: width,
          height: height,
          devicePixelRatio: actualDpr, // 使用实际设备像素比，解决模糊问题
          renderer: 'canvas', // 明确指定使用canvas渲染器
          useDirtyRect: false // 真机优化：禁用脏矩形优化以确保渲染质量
        });
        canvas.setChart(chart);

        // 处理图表数据
        const dates = this.data.chartData.map(item => item.date);
        const values = this.data.chartData.map(item => item.value);

        // 添加买卖点标记
        const markPoints = this.generateTradeMarkPoints();

        var option = {
          title: {
            text: '基金净值走势',
            left: 'center',
            top: 10,
            textStyle: {
              fontSize: 16,
              fontWeight: 'bold',
              color: '#333'
            }
          },
          grid: {
            containLabel: true,
            top: 60,
            bottom: 20,
            left: 20,
            right: 20
          },
          tooltip: {
            show: true,
            trigger: 'axis',
            backgroundColor: 'rgba(50,50,50,0.9)',
            borderColor: 'transparent',
            textStyle: {
              color: '#fff',
              fontSize: 12,
              // 去除文字阴影以解决真机显示问题
              textShadowBlur: 0,
              textShadowColor: 'transparent'
            },
            formatter: function (params) {
              // 基本净值信息
              let result = params[0].name + '<br/>' + params[0].seriesName + ': ' + params[0].value;

              // 检查是否有标记点
              const markPointSeries = params.find(p => p.componentType === 'markPoint');

              if (markPointSeries && markPointSeries.data) {
                const markPointData = markPointSeries.data.find(d => d.xAxis === params[0].dataIndex);

                if (markPointData && markPointData.data) {
                  const record = markPointData.data;
                  let detailInfo = record.type === 'buy'
                    ? `买入: ${record.units}份\n金额: ¥${record.amount}\n净值: ${record.netValue}`
                    : `卖出: ${record.units}份\n金额: ¥${record.amount}\n净值: ${record.netValue}`;

                  const formattedValue = detailInfo.replace(/\n/g, '<br/>');
                  result += '<br/><div style="margin-top:5px;padding:5px;border-top:1px solid #eee;">' +
                    '<strong style="color:' + markPointData.itemStyle.color + ';">' + markPointData.name + '</strong><br/>' +
                    formattedValue + '</div>';
                }
              }

              return result;
            }
          },
          xAxis: {
            type: 'category',
            boundaryGap: false,
            data: dates,
            axisLine: {
              lineStyle: {
                color: '#999',
                width: 1
              }
            },
            axisLabel: {
              color: '#666',
              fontSize: 11,
              interval: function (index, value) {
                const dataLength = dates.length;

                // 显示5个标签：最左、3个中间（平均分布）、最右
                if (dataLength <= 5) {
                  // 如果数据少于等于5个，显示所有
                  return true;
                }

                // 计算4个等分点的索引（包括首尾共5个点）
                const step = (dataLength - 1) / 4;
                const indices = [
                  0,                           // 最左
                  Math.round(step),            // 第一个中间点
                  Math.round(step * 2),        // 中间点
                  Math.round(step * 3),        // 第二个中间点
                  dataLength - 1               // 最右
                ];

                return indices.includes(index);
              },
              formatter: function (value) {
                return value.substring(5); // 只显示月-日部分
              }
            }
          },
          yAxis: {
            type: 'value',
            splitLine: {
              lineStyle: {
                type: 'dashed',
                color: '#e6e6e6',
                width: 1
              }
            },
            scale: true,
            axisLabel: {
              color: '#666',
              fontSize: 11,
              formatter: '{value}'
            },
            axisLine: {
              show: false
            },
            axisTick: {
              show: false
            }
          },
          series: [{
            name: '净值',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: values,
            itemStyle: {
              color: '#1890ff'
            },
            lineStyle: {
              width: 2,
              color: '#1890ff'
            },
            animation: true,
            animationDuration: 300,
            animationEasing: 'linear',
            markPoint: {
              symbolSize: 40,
              data: markPoints
            }
          }]
        };

        // 设置图表选项
        try {
          chart.setOption(option);
        } catch (error) {
          console.error('updateChart设置图表选项失败:', error);
          throw error; // 重新抛出错误，让外层catch处理
        }

        // 保存chart实例到this中，以便后续更新
        self.chart = chart;
        return chart;
      } catch (error) {
        console.error('updateChart初始化图表失败:', error);
        // 如果初始化失败，500ms后重试
        setTimeout(() => {
          self.updateChart();
        }, 500);
      }
    });
  },

  // 更新图表数据的函数，不重新初始化图表
  updateChartData: function () {
    const ecComponent = this.selectComponent('#mychart-dom-fund');
    if (ecComponent) {
      const chart = ecComponent.getChart();
      if (chart) {
        // 添加数据验证
        if (!this.data.chartData || this.data.chartData.length === 0) {
          return;
        }

        // 处理图表数据
        const dates = this.data.chartData.map(item => item.date);
        const values = this.data.chartData.map(item => item.value);

        // 添加买卖点标记
        const markPoints = this.generateTradeMarkPoints();

        // 使用完整的图表配置来避免坐标系统重建问题
        const option = {
          title: {
            text: '基金净值走势',
            left: 'center',
            top: 10,
            textStyle: {
              fontSize: 16,
              fontWeight: 'bold',
              color: '#333'
            }
          },
          grid: {
            containLabel: true,
            top: 60,
            bottom: 20,
            left: 20,
            right: 20
          },
          xAxis: {
            type: 'category',
            boundaryGap: false,
            data: dates,
            axisLine: {
              lineStyle: {
                color: '#999',
                width: 1
              }
            },
            axisLabel: {
              color: '#666',
              fontSize: 11,
              interval: function (index, value) {
                const dataLength = dates.length;

                // 显示5个标签：最左、3个中间（平均分布）、最右
                if (dataLength <= 5) {
                  // 如果数据少于等于5个，显示所有
                  return true;
                }

                // 计算4个等分点的索引（包括首尾共5个点）
                const step = (dataLength - 1) / 4;
                const indices = [
                  0,                           // 最左
                  Math.round(step),            // 第一个中间点
                  Math.round(step * 2),        // 中间点
                  Math.round(step * 3),        // 第二个中间点
                  dataLength - 1               // 最右
                ];

                return indices.includes(index);
              },
              formatter: function (value) {
                return value.substring(5); // 只显示月-日部分
              }
            }
          },
          yAxis: {
            type: 'value',
            splitLine: {
              lineStyle: {
                type: 'dashed',
                color: '#e6e6e6',
                width: 1
              }
            },
            scale: true,
            axisLabel: {
              color: '#666',
              fontSize: 11,
              formatter: '{value}'
            },
            axisLine: {
              show: false
            },
            axisTick: {
              show: false
            }
          },
          series: [{
            name: '净值',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: values,
            itemStyle: {
              color: '#1890ff'
            },
            lineStyle: {
              width: 2,
              color: '#1890ff'
            },
            animation: true,
            animationDuration: 300,
            animationEasing: 'linear',
            markPoint: {
              symbolSize: 40,
              data: markPoints
            }
          }]
        };

        try {
          chart.setOption(option, true); // 使用notMerge=true来强制重建坐标系统
        } catch (error) {
          console.error('图表更新失败，尝试重新初始化:', error);
          // 如果setOption失败，重新初始化图表
          this.updateChart();
        }
      } else {
        // 如果没有图表实例，重新初始化
        this.updateChart();
      }
    } else {
      // 如果没有图表组件，重新初始化
      this.updateChart();
    }
  },

  // 生成买卖点标记
  generateTradeMarkPoints: function () {
    const { tradingHistory, chartData } = this.data;

    if (!tradingHistory || tradingHistory.length === 0 || !chartData || chartData.length === 0) {
      return [];
    }

    // 生成的标记点数组
    const markPoints = [];

    // 处理图表显示的日期范围
    const chartDates = chartData.map(item => item.date);

    // 筛选在当前图表日期范围内的交易记录
    tradingHistory.forEach((record, index) => {

      // 检查交易日期是否在当前显示的图表日期范围内
      if (chartDates.includes(record.date)) {
        // 找到该日期在图表数据中的索引
        const dateIndex = chartDates.indexOf(record.date);

        // 数据验证
        if (dateIndex < 0 || dateIndex >= chartData.length) {
          return;
        }

        if (!chartData[dateIndex] || typeof chartData[dateIndex].value === 'undefined') {
          return;
        }

        // 构建详细的交易提示信息 - 移除 value 字段，但保留 detailInfo 用于 tooltip
        let detailInfo = record.type === 'buy'
          ? `买入: ${record.units}份\n金额: ¥${record.amount}\n净值: ${record.netValue}`
          : `卖出: ${record.units}份\n金额: ¥${record.amount}\n净值: ${record.netValue}`;

        // 创建标记点配置
        const markPoint = {
          name: record.type === 'buy' ? '买入' : '卖出',
          xAxis: dateIndex,
          yAxis: chartData[dateIndex].value,
          itemStyle: {
            color: record.type === 'buy' ? '#f56c6c' : '#67c23a'
          },
          symbol: record.type === 'buy' ? 'triangle' : 'triangle',
          symbolRotate: record.type === 'buy' ? 0 : 180,
          symbolSize: [15, 15],
          emphasis: {
            scale: true,
            scaleSize: 1.5
          },
          data: record // 存储完整的记录数据以便tooltip使用
        };

        markPoints.push(markPoint);
      }
    });
    return markPoints;
  },

  // 切换详情显示
  toggleDetails: function () {
    this.setData({
      showDetails: !this.data.showDetails
    });
  },

  /**
   * 切换到新基金
   * 当当前基金数据接近用完时自动调用
   */
  switchToNewFund: async function () {
    const { currentIndex } = this.data;

    // 生成新的基金信息
    const newFundName = `模拟基金${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`; // A-Z

    try {
      wx.showLoading({ title: '切换新基金中...' });

      // V2架构：直接重置本地数据，无需云函数切换
      const app = getApp();
      app.globalData.userData.fundData = {
        transactions: [],
        fundName: newFundName,
        shares: 0,
        currentIndex: 0,
        initialIndex: 0,
        totalAmount: GAME_CONFIG.INITIAL_CASH,
        totalProfitRate: 0
      };

      // 重新初始化页面数据
      await this.initializePageData();

      wx.hideLoading();

      wx.showModal({
        title: '基金切换成功',
        content: `原基金数据已用完，系统已为您切换到新基金"${newFundName}"继续投资体验。\n\n交易记录已重新开始。`,
        showCancel: false,
        confirmText: '继续投资',
        success: () => {
          // 显示成功提示
          wx.showToast({
            title: '开始新的投资旅程',
            icon: 'success'
          });
        }
      });

    } catch (error) {
      wx.hideLoading();
      console.error('基金切换失败:', error);

      wx.showModal({
        title: '切换失败',
        content: '基金切换遇到问题，请重试或联系客服。',
        showCancel: false,
        confirmText: '我知道了'
      });
    }
  },

  // 修改nextDay方法 - 使用GameStateManager统一处理，消除双重计算逻辑
  nextDay: async function () {

    const { currentIndex, fundData, gameEnded, totalTradingDays, initialIndex, isLastDayCompleted, timePeriod } = this.data;

    // 检查游戏是否已结束
    if (gameEnded) {
      wx.showToast({
        title: '游戏已结束',
        icon: 'none'
      });
      return;
    }

    // 检查是否已完成最后一天
    if (isLastDayCompleted) {
      wx.showToast({
        title: '请点击分享按钮查看投资成果',
        icon: 'none'
      });
      return;
    }

    // 检查是否接近数据末尾，需要切换到新基金
    if (currentIndex >= fundData.length - 2) {
      await this.switchToNewFund();
      return;
    }

    if (currentIndex >= fundData.length - 1) {
      wx.showToast({
        title: '已到最后一天',
        icon: 'none'
      });
      return;
    }

    // 获取GameStateManager实例
    const gameStateManager = this.data.gameStateManager;
    if (!gameStateManager) {
      console.error('GameStateManager未初始化，无法进入下一天');
      wx.showToast({ title: '系统错误，请重新进入', icon: 'error' });
      return;
    }

    // 计算当前已使用的游戏天数
    const currentUsedGameDays = currentIndex - initialIndex;
    const nextUsedGameDays = currentUsedGameDays + 1; // 即将达到的已使用天数

    // Store current state for potential rollback
    const oldCurrentIndex = currentIndex;
    const oldRawData = JSON.parse(JSON.stringify(this.data._rawData));
    const oldChartData = this.data.chartData.slice();

    const nextIndex = currentIndex + 1;

    // 检查是否到达最后一天
    const willBeLastDay = nextUsedGameDays >= totalTradingDays;

    // 更新全局倒计时状态
    const app = getApp();
    const globalCountdown = app.globalData.investmentCountdown;
    if (willBeLastDay) {
      globalCountdown.isGameCompleted = true;
      globalCountdown.remainingDays = 0;
      globalCountdown.lastUpdateTime = Date.now();
    }

    try {
      // 1. 先记录当前交易日的CSV日志（在重置全局变量之前）
      this.logDailyDataToCSV();

      // 2. 重置交易信息全局变量为新一天的初始状态
      this.setData({
        _currentOperationType: '无操作',
        _currentTransactionAmount: 0,
        _currentTransactionShares: 0
      });

      // 3. 更新GameStateManager的当前索引
      gameStateManager.gameState.currentIndex = nextIndex;


      // 4. 重新计算所有状态
      gameStateManager.recalculateAll();


      // 5. 从GameStateManager获取最终的统一状态
      const finalState = gameStateManager.getState();

      // 6. 一次性更新页面状态 - 基于最终计算结果，无乐观更新
      this.setData({
        currentIndex: nextIndex,
        '_rawData.currentNetValue': finalState.currentNetValue,
        '_rawData.fundValue': finalState.fundValue,
        '_rawData.totalAmount': finalState.totalAmount,
        '_rawData.dailyChange': finalState.dailyChange,
        '_rawData.dailyProfit': finalState.dailyProfit,
        '_rawData.holdingProfit': finalState.holdingProfit,
        '_rawData.realizedProfit': finalState.realizedProfit,
        '_rawData.totalProfit': finalState.totalProfit,
        '_rawData.profitRate': finalState.profitRate,
        '_rawData.totalProfitRate': finalState.totalProfitRate,
        '_rawData.avgCost': finalState.avgCost,
        '_rawData.cash': finalState.cash,
        '_rawData.fundUnits': finalState.fundUnits,
        chartData: this.calculateChartDataWindow(nextIndex, timePeriod),
        isLastDayCompleted: willBeLastDay
      });


      // 7. 同步更新UI显示
      this.updateDisplayData();

      this.updateChartData();
      this.updateCountdown();

      // 8. 云端同步（异步，不阻塞UI）
      // **性能优化：异步同步，不阻塞UI操作**
      this.performAsyncCloudSync();

    } catch (error) {
      // 处理GameStateManager操作失败
      console.error('nextDay处理失败，回滚状态:', error);
      wx.showModal({
        title: '数据处理失败',
        content: '进入下一天时出现问题，已恢复到之前状态。请重试。',
        showCancel: false
      });

      // 回滚到之前状态
      this.setData({
        currentIndex: oldCurrentIndex,
        _rawData: oldRawData,
        chartData: oldChartData,
        isLastDayCompleted: false
      }, () => {
        this.updateDisplayData();
        this.updateChartData();
        this.updateCountdown();
      });
    }
  },

  /**
   * 异步云端同步 - 不阻塞UI操作
   */
  async performAsyncCloudSync() {
    try {
      // 检查网络状态
      const networkType = await wx.getNetworkType();
      if (networkType.networkType === 'none') {
        return;
      }

      // 网络可用，异步执行云端同步
      const syncResult = await this.syncGameDataToCloud();

      if (!syncResult.success) {
        console.warn('云端同步失败，但不影响游戏继续');
      }

    } catch (syncError) {
      console.warn('云端同步异常，但不影响游戏继续:', syncError);
    }
  },

  /**
   * 统一的交易处理函数 - 消除重复代码
   */
  async handleTransaction(transactionType, amount) {

    // 移除重复的loading状态，executeTransaction已经处理了

    try {
      const gameStateManager = this.data.gameStateManager;
      if (!gameStateManager) {
        throw new Error('GameStateManager 未初始化');
      }

      let transactionResult;
      if (transactionType === 'buy') {
        transactionResult = await gameStateManager.buyFund(amount);
      } else {
        transactionResult = await gameStateManager.sellFund(amount);
      }

      if (transactionResult.success) {
        await this.updateStateFromGameManager(gameStateManager, transactionResult, transactionType);

        wx.showToast({
          title: transactionType === 'buy' ? '买入成功' : '卖出成功',
          icon: 'success',
          duration: 1000
        });
      } else {
        throw new Error(transactionResult.error || '交易失败');
      }

    } catch (error) {
      console.error('handleTransaction失败:', error);
      wx.hideLoading();
      wx.showModal({
        title: '交易失败',
        content: error.message || '操作失败，请重试',
        showCancel: false
      });
    }
  },

  /**
   * 从GameStateManager更新页面状态 - 基于最终计算结果
   */
  async updateStateFromGameManager(gameStateManager, transactionResult, transactionType) {
    // 获取GameStateManager的最终状态
    const finalState = gameStateManager.getState();

    // 一次性更新页面状态 - 完全基于最终计算结果
    const stateUpdate = {
      '_rawData.cash': finalState.cash,
      '_rawData.fundUnits': finalState.fundUnits,
      '_rawData.fundValue': finalState.fundValue,
      '_rawData.totalAmount': finalState.totalAmount,
      '_rawData.holdingProfit': finalState.holdingProfit, // 新增：更新持仓收益
      '_rawData.realizedProfit': finalState.realizedProfit, // 新增：更新已实现收益
      '_rawData.totalProfit': finalState.totalProfit,
      '_rawData.profitRate': finalState.profitRate,
      '_rawData.totalProfitRate': finalState.totalProfitRate,
      '_rawData.avgCost': finalState.avgCost,
      '_rawData.currentNetValue': finalState.currentNetValue,
      '_rawData.dailyChange': finalState.dailyChange,
      '_rawData.dailyProfit': finalState.dailyProfit,
      tradingHistory: finalState.transactions
    };

    this.setData(stateUpdate);

    // 统一更新UI和历史记录
    this.updateUIAfterTransaction(transactionResult, transactionType, finalState);

    // 检查是否需要自动进入下一个交易日
    const { currentIndex, initialIndex, totalTradingDays } = this.data;
    const usedGameDays = currentIndex - initialIndex;
    const remaining = Math.max(0, totalTradingDays - usedGameDays);

    if (remaining > 0) {
      // 游戏未完成，自动进入下一个交易日
      setTimeout(() => {
        this.nextDay();
      }, 1000);
    } else {
      // 游戏已完成，不自动进入下一日
    }
  },

  /**
   * 买入确认回调函数 - 使用统一交易处理
   */
  buyConfirm: async function (amount_from_page) {

    await this.executeTransaction('buy', amount_from_page, 'Processing Buy...');
  },

  /**
   * 卖出确认回调函数 - 使用统一交易处理
   */
  sellConfirm: async function (units_from_page) {

    await this.executeTransaction('sell', units_from_page, 'Processing Sell...');
  },

  /**
   * 统一的交易执行函数 - 消除买卖确认的冗余代码
   */
  executeTransaction: async function (transactionType, amount, loadingText) {
    const oldRawData = JSON.parse(JSON.stringify(this.data._rawData));
    const oldTradingHistory = JSON.parse(JSON.stringify(this.data.tradingHistory));

    try {
      wx.showLoading({ title: loadingText });
      await this.handleTransaction(transactionType, amount);
    } catch (error) {
      this.handleTransactionError(error, oldRawData, oldTradingHistory, transactionType === 'buy' ? '买入' : '卖出');
    }
  },

  /**
   * 统一的交易后UI更新函数 - 基于最终状态，无乐观更新
   */
  updateUIAfterTransaction: function (transactionResult, transactionType, finalState) {

    const logAmount = transactionResult.transaction.amount;
    const logUnits = transactionResult.transaction.units;

    // 更新交易信息全局变量
    this.setData({
      _currentOperationType: transactionType === 'buy' ? '买入' : '卖出',
      _currentTransactionAmount: logAmount,
      _currentTransactionShares: logUnits
    });

    // 更新UI显示
    this.updateDisplayData();
    this.updateReversedTradingHistory();
    this.updateChartData(); // 买入和卖出都需要更新图表


    const logData = {
      amount: logAmount,
      units: logUnits,
      netValue: transactionResult.transaction.price
    };
    if (transactionType === 'sell') {
      logData.realizedProfitFromSale = transactionResult.realizedGain;
    }

    // 同步标记（已简化为日志记录）
    this.markTransactionForSync(transactionResult.transaction);

    wx.hideLoading();

    // 显示成功提示 - 基于最终状态
    if (transactionType === 'buy') {
      const isAllInvested = finalState.cash < 0.01;
      const toastTitle = isAllInvested ? '已全仓，花光所有现金' : `买入${logUnits.toFixed(2)}份成功`;


      wx.showToast({
        title: toastTitle,
        icon: 'success'
      });

      // 买入成功跟踪
      userActionTracker.track('买入成功-数据状态', {
        cash: finalState.cash,
        fundUnits: finalState.fundUnits,
        totalAmount: finalState.totalAmount,
        transactionCount: finalState.transactions.length
      });
      userActionTracker.track('买入完成', {
        amount: logAmount,
        afterCash: finalState.cash,
        afterTotalAmount: finalState.totalAmount
      });
    } else {
      const isCleared = finalState.fundUnits === 0;
      const toastTitle = isCleared ? '已清仓，卖出全部份额' : `卖出${logUnits.toFixed(2)}份成功`;


      wx.showToast({
        title: toastTitle,
        icon: 'success'
      });
    }
  },

  /**
   * 统一的错误处理函数
   */
  handleTransactionError: function (error, oldRawData, oldTradingHistory, transactionType) {

    wx.hideLoading();
    console.error(`[${transactionType}] 失败，回滚状态. Error:`, error);
    wx.showModal({
      title: `${transactionType}失败`,
      content: error.message || '交易处理出现问题，已恢复到之前状态',
      showCancel: false
    });


    // 回滚状态
    this.setData({
      _rawData: oldRawData,
      tradingHistory: oldTradingHistory
    }, () => {
      this.updateDisplayData();
      this.updateChartData();
    });
  },



  // 更新并格式化反转的交易记录（最新的在最上方）
  updateReversedTradingHistory: function () {
    const { tradingHistory } = this.data;

    // 创建一个新的反转后的数组，并格式化数字用于显示
    const formattedReversedHistory = tradingHistory.slice().reverse().map(item => {
      return {
        type: item.type,
        date: item.date,
        netValue: item.price,
        amount: item.amount,
        units: item.units,
        // WXML中不建议直接调用函数，所以在这里格式化好
        displayNetValue: (item.price || 0).toFixed(4),
        displayUnits: (item.units || 0).toFixed(2),
        displayAmount: (item.amount || 0).toFixed(2),
      };
    });

    this.setData({
      reversedTradingHistory: formattedReversedHistory
    });
  },

  // 导航到买入页面
  navigateToBuyPage: function () {
    // 确保传递最新的数据
    const { currentNetValue, cash } = this.data._rawData;
    wx.navigateTo({
      url: `./buyPage/buyPage?netValue=${currentNetValue}&cash=${cash}`
    });
  },

  // 导航到卖出页面
  navigateToSellPage: function () {
    const { currentNetValue, fundUnits } = this.data._rawData;

    wx.navigateTo({
      url: `./sellPage/sellPage?netValue=${currentNetValue}&fundUnits=${fundUnits}`
    });
  },

  // 计算倒计时动态颜色
  calculateCountdownColors: function (remaining, total) {
    // 计算倒计时进度 (0-1)，剩余天数越少，progress越大
    const progress = Math.min(1, Math.max(0, (total - remaining) / total));

    // 定义颜色阶段：白色 -> 橙色 -> 红色
    let backgroundColor, shadowColor;

    if (progress <= 0.5) {
      // 前半段：白色到橙色 (progress: 0-0.5)
      const localProgress = progress * 2; // 映射到 0-1

      // 白色 #ffffff 到橙色 #ffa500
      const r = Math.round(255);
      const g = Math.round(255 - (255 - 165) * localProgress);
      const b = Math.round(255 - 255 * localProgress);

      backgroundColor = `rgb(${r}, ${g}, ${b})`;
      shadowColor = `rgba(${r}, ${g}, ${b}, 0.3)`;
    } else {
      // 后半段：橙色到红色 (progress: 0.5-1)
      const localProgress = (progress - 0.5) * 2; // 映射到 0-1

      // 橙色 #ffa500 到红色 #ff6b6b
      const r = Math.round(255);
      const g = Math.round(165 - (165 - 107) * localProgress);
      const b = Math.round(0 + 107 * localProgress);

      backgroundColor = `rgb(${r}, ${g}, ${b})`;
      shadowColor = `rgba(${r}, ${g}, ${b}, 0.3)`;
    }

    // 文字颜色：当背景接近白色时使用深色文字，否则使用白色文字
    const textColor = progress < 0.3 ? '#333' : 'white';

    // 进度条颜色：根据背景色调整，确保可见性
    let progressBarColor, progressBgColor;
    if (progress < 0.3) {
      // 背景接近白色时，使用深色进度条
      progressBarColor = 'linear-gradient(90deg, #4CAF50, #2196F3)';
      progressBgColor = 'rgba(0, 0, 0, 0.1)';
    } else if (progress < 0.7) {
      // 背景是橙色时，使用对比色进度条
      progressBarColor = 'linear-gradient(90deg, #fff, #ffeb3b)';
      progressBgColor = 'rgba(255, 255, 255, 0.3)';
    } else {
      // 背景是红色时，使用亮色进度条
      progressBarColor = 'linear-gradient(90deg, #ffeb3b, #fff)';
      progressBgColor = 'rgba(255, 255, 255, 0.4)';
    }

    return {
      backgroundColor,
      shadowColor,
      textColor,
      progressBarColor,
      progressBgColor,
      progress
    };
  },

  // 更新倒计时数据
  updateCountdown: function () {
    const { currentIndex, totalTradingDays, initialIndex, isLastDayCompleted } = this.data;
    const app = getApp();

    // 已使用的游戏交易日等于当前索引减去初始索引
    const usedGameDays = currentIndex - initialIndex;

    // **关键修改：使用全局倒计时状态，避免未完成游戏时被重置**
    const globalCountdown = app.globalData.investmentCountdown;

    // 如果全局倒计时还有剩余天数且游戏未完成，使用全局状态
    let remaining;
    if (!globalCountdown.isGameCompleted && globalCountdown.remainingDays > 0) {
      // 计算应该消耗的天数（基于游戏进度）
      const shouldConsumedDays = usedGameDays;
      remaining = Math.max(0, totalTradingDays - shouldConsumedDays);

      // 更新全局倒计时状态
      globalCountdown.remainingDays = remaining;
      globalCountdown.lastUpdateTime = Date.now();
    } else {
      // 游戏已完成或重新开始，使用本地计算
      remaining = Math.max(0, totalTradingDays - usedGameDays);
    }

    const progress = ((totalTradingDays - remaining) / totalTradingDays) * 100;

    // 优化显示：当剩余1天时，显示特殊的鼓励文本
    let displayText, displayUnit, displayLabel;
    if (remaining > 1) {
      displayText = `${remaining}`;
      displayUnit = '天';
      displayLabel = '剩余交易日';
    } else if (remaining === 1) {
      displayText = '最后一天';
      displayUnit = '，把握机会！';
      displayLabel = '剩余';
    } else {
      displayText = '0';
      displayUnit = '天';
      displayLabel = '剩余交易日';
    }

    // **关键修改：如果已完成最后一天，显示特殊文本**
    if (isLastDayCompleted) {
      displayText = '已完成';
      displayUnit = '';
      displayLabel = '投资挑战';
      // 标记游戏完成
      globalCountdown.isGameCompleted = true;
    }

    // **新增：计算动态颜色**
    const countdownColors = this.calculateCountdownColors(remaining, totalTradingDays);

    // **新增：判断是否处于紧急状态（剩余天数少于30%且大于0）**
    const isUrgent = remaining > 0 && remaining <= totalTradingDays * 0.3;

    this.setData({
      remainingDays: remaining,
      remainingDaysText: displayText,
      remainingDaysUnit: displayUnit,
      remainingDaysLabel: displayLabel,
      progressPercent: Math.min(100, progress),
      // **新增：动态颜色数据**
      countdownBackgroundColor: countdownColors.backgroundColor,
      countdownShadowColor: countdownColors.shadowColor,
      countdownTextColor: countdownColors.textColor,
      countdownColorProgress: countdownColors.progress,
      // **新增：紧急状态标识**
      countdownUrgent: isUrgent,
      // **新增：进度条动态颜色**
      countdownProgressBarColor: countdownColors.progressBarColor,
      countdownProgressBgColor: countdownColors.progressBgColor
    });

    // 当剩余天数很少时给出警告
    if (remaining <= 10 && remaining > 0 && !isLastDayCompleted) {
      wx.vibrateShort(); // 震动提醒
    }

    // **关键修改：只有在非最后一天完成状态下才检查游戏结束**
    // 最后一天完成状态下，等待用户点击分享按钮来正式结束游戏
    if (remaining <= 0 && !this.data.gameEnded && !isLastDayCompleted) {
      this.endGame();
    }
  },

  // 记录交易日志
  logTransaction: function (operation, data) {
  },

  // 游戏结束处理
  endGame: function () {
    // 立即设置游戏结束状态，防止用户继续操作
    this.setData({
      gameEnded: true,
      showChart: false // 隐藏图表，显示游戏结束总结
    });

    // 移除重复的云端同步 - 最后一天的数据已经在nextDay()中同步了

    // 使用统一的游戏数据构建方法
    const gameEndData = this.buildGameEndData();

    // 延迟导航到登录页面并弹出分享卡片
    setTimeout(() => {
      const redirectUrl = `/pages/login/login?showGameResult=true&gameData=${encodeURIComponent(JSON.stringify(gameEndData))}`;

      wx.redirectTo({
        url: redirectUrl
      });
    }, 800);
  },

  // 计算成就等级
  calculateAchievement: function (profitRate, tradingCount) {
    if (profitRate >= 50) {
      return {
        level: 'master',
        icon: '👑',
        title: '投资大师',
        desc: '惊人的投资表现！您已达到大师级水平！'
      };
    } else if (profitRate >= 20) {
      return {
        level: 'expert',
        icon: '💎',
        title: '投资专家',
        desc: '优秀的投资技巧！您的表现令人印象深刻！'
      };
    } else if (profitRate >= 5) {
      return {
        level: 'advanced',
        icon: '⭐',
        title: '进阶投资者',
        desc: '不错的投资收益！继续保持这种势头！'
      };
    } else {
      return {
        level: 'beginner',
        icon: '🌱',
        title: '投资新手',
        desc: '投资是一门学问，继续努力提升投资技巧！'
      };
    }
  },

  // 关闭游戏结果卡片
  closeGameResult: function () {
    gameUtils.closeGameResult()
  },





  // 按钮触摸开始事件
  onBtnTouchStart: function (e) {
    const type = e.currentTarget.dataset.type;
    const stateKey = type + 'Pressed';
    this.setData({
      [stateKey]: true
    });
  },

  // 按钮触摸结束事件
  onBtnTouchEnd: function (e) {
    const type = e.currentTarget.dataset.type;
    const stateKey = type + 'Pressed';
    this.setData({
      [stateKey]: false
    });
  },

  // 显示分享并完成游戏
  showShareAndFinish: function () {
    const startTime = Date.now();

    try {
      const dataStartTime = Date.now();

      // 获取最终状态
      const gameStateManager = this.data.gameStateManager;
      if (!gameStateManager) {
        throw new Error('GameStateManager未初始化');
      }

      const finalState = gameStateManager.getState();










      const gameEndData = {
        currentIndex: this.data.currentIndex,
        totalAmount: finalState.totalAmount,
        cash: finalState.cash,
        fundValue: finalState.fundValue,
        totalProfit: finalState.totalProfit,
        totalProfitRate: finalState.totalProfitRate,
        fundUnits: finalState.fundUnits,
        transactions: finalState.transactions || [],
        usedGameDays: this.data.usedGameDays,

        // 添加完整的用户数据
        finalUserData: {
          currentIndex: this.data.currentIndex,
          totalAmount: finalState.totalAmount,
          cash: finalState.cash,
          fundUnits: finalState.fundUnits,
          fundData: {
            transactions: finalState.transactions || [],
            lastTransactionDay: this.data.currentIndex
          }
        },

        // 添加分享卡片显示字段
        finalTotalAmount: (finalState.totalAmount || 0).toFixed(2),
        finalTotalProfitRate: (finalState.totalProfitRate || 0).toFixed(2),
        currentRoundProfit: (finalState.totalProfit || 0).toFixed(2),
        currentRoundProfitRate: (finalState.profitRate || 0).toFixed(2), // 🔧 修复：使用 profitRate 而不是 totalProfitRate
        tradingCount: finalState.transactions?.length || 0,
        investmentDays: this.data.currentIndex - this.data.initialIndex, // 🔧 修复：使用正确的投资天数计算

        // 成就评级（使用现有方法）
        ...(() => {
          const achievement = this.calculateAchievement(finalState.totalProfitRate || 0, finalState.transactions?.length || 0);
          return {
            achievementLevel: achievement.level,
            achievementIcon: achievement.icon,
            achievementTitle: achievement.title,
            achievementDesc: achievement.desc
          };
        })()
      };

      const saveStartTime = Date.now();

      // 保存最终状态到全局数据，确保数据不丢失
      const app = getApp();

      // 更新全局用户数据为最终状态
      if (app.globalData.userData) {
        app.globalData.userData.currentIndex = this.data.currentIndex;
        app.globalData.userData.totalAmount = finalState.totalAmount;
        app.globalData.userData.cash = finalState.cash;
        app.globalData.userData.fundUnits = finalState.fundUnits;
        if (app.globalData.userData.fundData) {
          app.globalData.userData.fundData.transactions = finalState.transactions || [];
          app.globalData.userData.fundData.lastTransactionDay = this.data.currentIndex;
        }
      }

      // 保存游戏结束数据
      app.globalData.gameEndData = gameEndData;





      const gameDataParam = encodeURIComponent(JSON.stringify(gameEndData));








      wx.redirectTo({
        url: `/pages/login/login?showGameResult=true&gameData=${gameDataParam}`
      });

    } catch (error) {
      console.error('showShareAndFinish出错:', error);
      // 出错时直接跳转，不带数据
      wx.redirectTo({
        url: '/pages/login/login'
      });
    }
  },

  /**
   * 验证并修正数据一致性
   */






  /**
   * 初始化CSV日志
   */
  initCSVLog: function () {
    const headers = [
      '日期', '游戏天数', '净值', '日涨跌幅', '操作类型', '交易金额', '交易份额',
      '现金余额', '持仓份额', '基金市值', '总资产', '当日盈亏', '持仓收益',
      '持仓收益率', '累计收益率', '持仓成本', '当前周期总投入', '当前周期总卖出', '历史总投入', '历史总卖出'
    ].join(',');
    console.log('[csv]', headers);
  },

  /**
   * 记录每日数据到CSV - 简化版本，无条件记录
   */
  logDailyDataToCSV: function () {
    const gameStateManager = this.data.gameStateManager;
    const currentData = this.data.fundData[this.data.currentIndex];

    if (!gameStateManager || !currentData) {
      return;
    }

    // 定义安全的数字格式化函数
    const safeToFixed = (value, decimals = 2) => {
      if (value === null || value === undefined || isNaN(value)) {
        return '0';
      }
      return parseFloat(value).toFixed(decimals);
    };

    // 从GameStateManager获取状态数据
    const state = gameStateManager.getState();

    // 从全局变量获取交易信息
    const operationType = this.data._currentOperationType;
    const transactionAmount = this.data._currentTransactionAmount;
    const transactionShares = this.data._currentTransactionShares;

    // 构建CSV行数据
    const csvRow = [
      currentData.date,                          // 日期
      this.data.currentIndex + 1,                // 游戏天数
      safeToFixed(currentData.netValue, 6),      // 净值
      safeToFixed(currentData.dailyChange, 6),   // 日涨跌幅
      operationType,                             // 操作类型
      safeToFixed(transactionAmount, 4),         // 交易金额
      safeToFixed(transactionShares, 4),         // 交易份额
      safeToFixed(state.cash, 4),                // 现金余额
      safeToFixed(state.fundUnits, 4),           // 持仓份额
      safeToFixed(state.fundValue, 4),           // 基金市值
      safeToFixed(state.totalAmount, 4),         // 总资产
      safeToFixed(state.dailyProfit || 0, 4),    // 当日盈亏
      safeToFixed(state.holdingProfit, 4),       // 持仓收益
      safeToFixed(state.profitRate, 4),          // 持仓收益率
      safeToFixed(state.totalProfitRate, 4),     // 累计收益率
      safeToFixed(state.avgCost, 6),             // 持仓成本
      safeToFixed(state.totalInvested || 0, 4), // 当前周期总投入
      safeToFixed(state.totalSold || 0, 4),      // 当前周期总卖出
      safeToFixed(state.historicalInvested || 0, 4), // 历史总投入
      safeToFixed(state.historicalSold || 0, 4)       // 历史总卖出
    ].join(',');

    // 输出日志到console
    console.log('[csv]', csvRow);
  },



  /**
   * 初始化所有数据
   */
  initializeData: async function () {
    const startTime = Date.now();

    try {
      await this.initializePageData();

      const step2Start = Date.now();
      await this.loadUserDataAndState();

    } catch (error) {
      console.error('initializeData失败:', error);
      throw error;
    }
  },

  onShow: function () {
    const app = getApp();

    // GameStateManager已统一处理所有交易同步，无需额外检查

    userActionTracker.track('进入投资页面', {
      currentIndex: this.data.currentIndex,
      totalAmount: this.data._rawData.totalAmount
    });
  },

  onHide: function () {
  },

  onUnload: function () {
  },





  /**
   * 分享给好友
   */
  onShareAppMessage: function () {
    const { _rawData } = this.data;
    const { totalAmount, totalProfitRate } = _rawData;

    const profit = totalProfitRate >= 0 ? '盈利' : '亏损';
    const profitRate = Math.abs(totalProfitRate).toFixed(2);

    return {
      title: `我在养基高手中${profit}了${profitRate}%！`,
      path: '/pages/login/login',
      imageUrl: '' // 使用默认截图
    };
  },

  /**
   * 加载用户数据和状态
   */
  loadUserDataAndState: async function () {
    try {
      const app = getApp();
      const userData = app.globalData.userData;

      // 初始化GameStateManager
      const gameStateManager = new GameStateManager();

      await gameStateManager.initialize(this.data.fundData, userData);
      this.setData({ gameStateManager });

      // 设置游戏参数
      const { initialIndex, currentIndex } = userData;



      this.setData({
        initialIndex: initialIndex,
        currentIndex: currentIndex,
        totalTradingDays: GAME_CONFIG.TOTAL_TRADING_DAYS
      });

      // 同步状态
      const finalState = gameStateManager.getState();



      this.setData({
        '_rawData.cash': finalState.cash,
        '_rawData.fundUnits': finalState.fundUnits,
        '_rawData.fundValue': finalState.fundValue,
        '_rawData.totalAmount': finalState.totalAmount,
        '_rawData.currentNetValue': finalState.currentNetValue,
        '_rawData.dailyChange': finalState.dailyChange,
        '_rawData.dailyProfit': finalState.dailyProfit,
        '_rawData.holdingProfit': finalState.holdingProfit,
        '_rawData.realizedProfit': finalState.realizedProfit,
        '_rawData.totalProfit': finalState.totalProfit,
        '_rawData.profitRate': finalState.profitRate,
        '_rawData.totalProfitRate': finalState.totalProfitRate,
        '_rawData.avgCost': finalState.avgCost,
        tradingHistory: finalState.transactions
      });

      // 更新UI显示
      this.updateDisplayData();

      // 处理倒计时
      const totalDays = this.data.totalTradingDays;
      const remaining = totalDays - (currentIndex - initialIndex);



      if (remaining <= 0) {
        // 游戏已完成，自动开始新一轮投资挑战
        this.startNewRound(currentIndex);
      } else {
        // 游戏未完成，正常更新倒计时
        const app = getApp();
        const globalCountdown = app.globalData.investmentCountdown;

        // 初始化全局倒计时状态（如果尚未初始化）
        if (globalCountdown.lastUpdateTime === null) {
          globalCountdown.remainingDays = remaining;
          globalCountdown.isGameCompleted = false;
          globalCountdown.lastUpdateTime = Date.now();
        }

        // 更新倒计时
        this.updateCountdown();

        // 游戏未完成时，需要计算当前状态的图表数据
        const currentChartData = this.calculateChartDataWindow(currentIndex, this.data.timePeriod);

        // 追踪chartData变化
        const oldChartData = this.data.chartData;
        this._trackChartDataChange('loadUserDataAndState', oldChartData, currentChartData);

        this.setData({
          chartData: currentChartData
        }, () => {
          // 验证图表数据设置是否成功
          if (!this.data.chartData || this.data.chartData.length === 0) {
            // 立即重试设置
            this.setData({ chartData: currentChartData });
          }
        });
      }

      // 重新计算昨日收益
      this.recalculateDailyProfit();

      return Promise.resolve()
    } catch (error) {
      console.error('加载用户数据失败:', error)
      return Promise.reject(error)
    }
  },

  /**
   * 初始化页面数据
   */
  initializePageData: async function () {
    const startTime = Date.now();

    try {
      // 初始化CSV日志
      this.initCSVLog();

      // 检查用户登录状态
      if (!this.checkUserLogin()) {
        throw new Error('用户未登录');
      }

      // 初始化基础数据 - 存储为原始数字
      this.setData({
        '_rawData.totalAmount': GAME_CONFIG.INITIAL_CASH,
        '_rawData.cash': GAME_CONFIG.INITIAL_CASH,
        '_rawData.fundValue': 0,
        '_rawData.fundUnits': 0,
        '_rawData.dailyProfit': 0,
        '_rawData.totalProfit': 0,
        '_rawData.profitRate': 0,
        '_rawData.totalProfitRate': 0,
        '_rawData.avgCost': 0,
        // 初始化CSV日志全局变量
        _currentOperationType: '无操作',
        _currentTransactionAmount: 0,
        _currentTransactionShares: 0
      }, () => {
        // 更新显示数据
        this.updateDisplayData();
      });

      // 🔧 修复：正确引入基金数据
      const { indexData } = require('../../data/index_data.js');

      // 确保indexData存在
      if (!indexData || !Array.isArray(indexData) || indexData.length === 0) {
        throw new Error('基金数据不存在');
      }

      // 处理基金数据，存储净值和日涨跌幅为原始数字
      const processedFundData = indexData.map((item, index) => {
        const netValue_raw = item.indexValue / 1000; // 保持完整精度
        let dailyChange_raw = 0;
        if (index > 0) {
          const prevNetValue_raw = indexData[index - 1].indexValue / 1000;
          // 避免除以零
          if (prevNetValue_raw !== 0) {
            dailyChange_raw = ((netValue_raw - prevNetValue_raw) / prevNetValue_raw) * 100;
          }
        }
        return {
          date: item.date,
          indexValue: item.indexValue,
          netValue: netValue_raw, // 存储原始数字
          dailyChange: dailyChange_raw // 存储原始数字
        };
      });

      // 存储处理后的基金数据
      this.setData({ fundData: processedFundData });

      if (processedFundData && processedFundData.length > 0) {
        // 使用默认初始索引
        const initialIndex = Math.min(GAME_CONFIG.INITIAL_INDEX, processedFundData.length - 1);
        const currentData = processedFundData[initialIndex];

        // 初始化倒计时数据
        const totalDays = this.data.totalTradingDays;
        const usedGameDays = 0; // 游戏开始时已使用天数为0
        const remaining = Math.max(0, totalDays - usedGameDays);
        const progress = (usedGameDays / totalDays) * 100;

        // 初始化显示文本
        let displayText = remaining > 1 ? `${remaining}` : (remaining === 1 ? '最后' : '0');
        let displayUnit = remaining === 1 ? '一天' : '天';

        // 计算初始动态颜色
        const initialCountdownColors = this.calculateCountdownColors(remaining, totalDays);

        // 存储基金数据并设置当前索引
        this.setData({
          currentIndex: initialIndex,
          initialIndex: initialIndex,
          '_rawData.currentNetValue': currentData.netValue,
          '_rawData.dailyChange': currentData.dailyChange,
          timePeriod: '1m',
          remainingDays: remaining,
          remainingDaysText: displayText,
          remainingDaysUnit: displayUnit,
          progressPercent: progress,
          // 初始动态颜色数据
          countdownBackgroundColor: initialCountdownColors.backgroundColor,
          countdownShadowColor: initialCountdownColors.shadowColor,
          countdownTextColor: initialCountdownColors.textColor,
          countdownColorProgress: initialCountdownColors.progress,
          countdownUrgent: false,  // 初始状态不紧急
          countdownProgressBarColor: initialCountdownColors.progressBarColor,
          countdownProgressBgColor: initialCountdownColors.progressBgColor
        }, () => {
          // 更新显示数据
          this.updateDisplayData();

          // 检查是否有用户数据，如果有则跳过初始图表计算
          // 因为loadUserDataAndState会处理正确的图表计算
          const app = getApp();
          const hasUserData = app.globalData.userData && app.globalData.userData.currentIndex !== undefined;

          if (!hasUserData) {
            // 仅对新用户计算初始图表
            const chartData = this.calculateChartDataWindow(initialIndex, '1m');

            this.setData({ chartData: chartData });
          }
        });
      } else {
        throw new Error('基金数据处理失败');
      }
    } catch (error) {
      console.error('initializePageData 失败:', error);
      throw error;
    }
  },

  /**
   * 更新页面数据显示
   */
  updateDataForCurrentDay: function () {
    const gameStateManager = this.data.gameStateManager;
    if (!gameStateManager) {
      return;
    }

    const state = gameStateManager.getState();

    // **性能优化：合并所有setData到单次调用**
    const updateData = {
      currentIndex: state.currentIndex,
      currentNavData: state.currentNavData,
      yesterdayNavData: state.yesterdayNavData,
      totalAmount: state.totalAmount,
      cash: state.cash,
      fundValue: state.fundValue,
      fundUnits: state.fundUnits,
      totalProfit: state.totalProfit,
      totalProfitRate: state.totalProfitRate,
      yesterdayProfit: state.yesterdayProfit,
      yesterdayProfitRate: state.yesterdayProfitRate,
      transactions: state.transactions || [],

      // 更新日期和倒计时
      currentDate: this.data.fundData[state.currentIndex]?.date || '',
      remainingDays: Math.max(0, this.data.totalTradingDays - this.data.usedGameDays)
    };

    // **单次setData调用，显著提升性能**
    this.setData(updateData);
  },

}); 