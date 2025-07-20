const gameUtils = require('../../utils/gameUtils.js')

Page({
  data: {
    userInfo: null,
    isLoggedIn: false,
    isLogging: false,
    showLoginModal: false,
    hasInvestmentHistory: false,
    showGameResult: false,
    gameEndData: null,
    hasStartedSession: false
  },

  onLoad: function (options) {
    
    const app = getApp();
    
    // 检查是否显示分享卡片
    if (options.showGameResult === 'true' && options.gameData) {
      
      try {
        const gameData = JSON.parse(decodeURIComponent(options.gameData));

        
        this.setData({
          showGameResult: true,
          gameEndData: gameData
        });
      } catch (error) {
        console.error('解析游戏数据失败:', error);
      }
    }

    this.restoreSessionState();
    

  },

  onShow: function () {
    this.checkLoginStatus()
    this.loadLocalUserInfo()
  },

  /**
   * 加载本地用户信息
   */
  loadLocalUserInfo: function() {
    const app = getApp();
    
    // 只使用profile中的自定义头像和昵称
    if (app.globalData.userData && app.globalData.userData.profile) {
      const profile = app.globalData.userData.profile;
      if (profile.nickname && profile.avatar) {
        const userInfo = {
          nickName: profile.nickname,
          avatarUrl: profile.avatar
        };
        this.setData({
          userInfo: userInfo
        });
        return;
      }
    }

    // 如果没有profile数据，清空用户信息显示
    this.setData({
      userInfo: null
    });
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus: function() {
    const app = getApp()
    if (app.globalData.openid && app.globalData.userData) {
      this.setData({
        isLoggedIn: true
      })
      this.checkInvestmentHistory()
      // 加载用户头像昵称信息
      this.loadLocalUserInfo()
    } else {
      this.setData({
        isLoggedIn: false,
        hasInvestmentHistory: false,
        userInfo: null
      })
    }
  },

  /**
   * 检查用户是否有投资记录
   */
  checkInvestmentHistory: function() {
    const app = getApp()
    const userData = app.globalData.userData
    
    if (userData && userData.fundData) {
      const fundData = userData.fundData
      const hasTransactions = fundData.transactions && fundData.transactions.length > 0
      const hasShares = fundData.shares > 0
      const hasStartedGame = userData.currentIndex > (userData.initialIndex || 29)
      
      const hasHistory = hasTransactions || hasShares || hasStartedGame
      
      this.setData({
        hasInvestmentHistory: hasHistory
      })
    } else {
      this.setData({
        hasInvestmentHistory: false
      })
    }
  },

  /**
   * 开始投资按钮点击处理
   */
  startInvestment: function() {


    // 设置会话状态并保存到全局数据
    this.setData({
      hasStartedSession: true
    })
    
    // 保存到全局数据，防止页面跳转丢失
    const app = getApp();
    app.globalData.hasStartedInvestmentSession = true;
    

    if (app.globalData.openid && app.globalData.userData) {


      this.setData({
        isLogging: true
      })

      setTimeout(() => {
        this.setData({
          isLogging: false
        })
        this.goToFund()
      }, 100)
      return
    }

    this.setData({
      isLogging: true,
      isLoggedIn: false
    })
    
    app.cloudLogin().then(() => {
      return this.loadUserData()
    }).then(() => {
      this.setData({
        isLogging: false,
        showLoginModal: false,
        isLoggedIn: true
      })
      this.checkInvestmentHistory()
      // 重新加载用户头像昵称信息
      this.loadLocalUserInfo()
      
      wx.showToast({
        title: '登录成功',
        icon: 'success',
        duration: 500
      })

      setTimeout(() => {
        this.goToFund()
      }, 500)
    }).catch(error => {
      this.setData({
        isLogging: false,
        isLoggedIn: false
      })
      

      this.setData({
        showLoginModal: true
      })
    })
  },

  /**
   * 获取用户数据
   */
  loadUserData: function() {
    const app = getApp()
    return wx.cloud.callFunction({
      name: 'userDataManager',
      data: {
        action: 'getUserData'
      }
    }).then(result => {
      if (result.result && result.result.success) {
        const userData = result.result.data

        
        app.globalData.userData = userData
        app.globalData.hasUserData = true
        this.setData({
          isLoggedIn: true
        })
        this.checkInvestmentHistory()
        // 重新加载用户头像昵称信息
        this.loadLocalUserInfo()
        return userData
      } else {
        throw new Error(result.result?.error || '获取用户数据失败')
      }
    })
  },

  /**
   * 登录成功处理
   */
  onLoginSuccess: function() {
    this.setData({
      showLoginModal: false,
      isLogging: false
    })
    
    wx.showToast({
      title: '登录成功',
      icon: 'success',
      duration: 1000
    })

    setTimeout(() => {
      this.goToFund()
    }, 1000)
  },

  /**
   * 关闭登录弹窗
   */
  closeLoginModal: function() {
    this.setData({
      showLoginModal: false,
      isLogging: false
    })
  },

  /**
   * 一键登录
   */
  oneClickLogin: function() {
    const app = getApp()
    
    this.setData({
      isLogging: true,
      showLoginModal: false
    })
    
    app.cloudLogin().then(() => {
      return this.loadUserData()
    }).then(() => {
      this.setData({
        isLogging: false,
        isLoggedIn: true
      })
      
      wx.showToast({
        title: '登录成功',
        icon: 'success',
        duration: 1000
      })

      setTimeout(() => {
        this.goToFund()
      }, 1000)
    }).catch(error => {
      this.setData({
        isLogging: false,
        showLoginModal: true
      })
      
      console.error('一键登录失败', error)
      wx.showToast({
        title: '登录失败，请重试',
        icon: 'none'
      })
    })
  },

  /**
   * 跳转到基金页面
   */
  goToFund: function() {
    wx.redirectTo({
      url: '/pages/fund/fund'
    });
  },

  /**
   * 重新开始游戏 - 直接重置数据并跳转
   */
  restartGame: function() {
    wx.showModal({
      title: '重新开始',
      content: '确定要重新开始投资挑战吗？当前进度将会丢失。',
      success: (res) => {
        if (res.confirm) {
          // 前端生成重置数据
          const { createResetGameData } = require('../../utils/dataStructureUtils.js');
          const resetData = createResetGameData();
          
          // 调用云端纯更新接口
          wx.cloud.callFunction({
            name: 'userDataManager',
            data: {
              action: 'updateUserData',
              data: resetData
            }
          }).then(result => {
            if (result.result.success) {
              // 更新全局数据
              const app = getApp();
              if (app.globalData.userData) {
                Object.assign(app.globalData.userData, resetData);
              }
              
              // 重置全局倒计时状态
              app.globalData.investmentCountdown = {
                remainingDays: 10,
                isGameCompleted: false,
                lastUpdateTime: null
              };
              
              wx.showToast({
                title: '已重置游戏',
                icon: 'success',
                duration: 1500
              });

              setTimeout(() => {
                wx.redirectTo({
                  url: '/pages/fund/fund'
                });
              }, 1500);
            } else {
              wx.showToast({
                title: '重置失败',
                icon: 'error'
              });
            }
          }).catch(error => {
            console.error('重置游戏数据失败:', error);
            wx.showToast({
              title: '重置失败',
              icon: 'error'
            });
          });
        }
      }
    });
  },

  /**
   * 关闭游戏结果卡片
   */
  closeGameResult: function() {

    gameUtils.closeGameResult()
  },

  /**
   * 微信分享 - 游戏结束卡片中的分享功能
   * 根据不同的数据来源生成分享标题和内容
   * 优先级：游戏结束数据 > 实时计算数据 > 默认标题
   */
  onShareAppMessage: function() {
    // 获取游戏结束数据（从页面参数传入）
    const { gameEndData } = this.data
    
    // 第一优先级：如果有游戏结束数据，直接使用
    if (gameEndData && gameEndData.finalTotalProfitRate !== undefined) {
      // 解析游戏结束数据中的关键指标
      const profitRate = parseFloat(gameEndData.finalTotalProfitRate) || 0  // 总收益率
      const totalAssets = parseFloat(gameEndData.finaltotalAssets) || 10000 // 总资产
      const tradingCount = parseInt(gameEndData.tradingCount) || 0         // 交易次数
      
      // 根据收益率和交易次数生成个性化分享标题
      const title = this.generateShareTitle(profitRate, totalAssets, tradingCount)
      return {
        title: title,
        path: `/pages/login/login`,  // 分享后跳转到登录页面
        imageUrl: '',  // 使用默认分享图片
      }
    }
  },

  /**
   * 生成分享标题的通用方法
   */
  generateShareTitle: function(profitRate, totalAssets, tradingCount) {
    if (tradingCount === 0) {
      return `我正在用1万资金挑战基金投资，你敢来试试吗？`
    } else if (profitRate >= 20) {
      return `哇塞！我的基金狂赚${Math.abs(profitRate).toFixed(1)}%，总资产${totalAssets.toFixed(0)}元！`
    } else if (profitRate >= 10) {
      return `太棒了！我的基金收益${Math.abs(profitRate).toFixed(1)}%，总资产${totalAssets.toFixed(0)}元！`
    } else if (profitRate >= 5) {
      return `不错哦！我的基金赚了${Math.abs(profitRate).toFixed(1)}%，总资产${totalAssets.toFixed(0)}元！`
    } else if (profitRate >= 0) {
      return `稳健投资！我的基金收益${Math.abs(profitRate).toFixed(1)}%，总资产${totalAssets.toFixed(0)}元！`
    } else {
      return `投资有风险！我体验了基金投资，总资产${totalAssets.toFixed(0)}元`
    }
  },

  /**
   * 跳转到排行榜页面
   */
  goToRanking: function() {
    wx.navigateTo({
      url: '/pages/ranking/ranking'
    });
  },

  /**
   * 头像点击处理 - 检查用户资料并提示设置
   */
  onAvatarTap: function() {
    const app = getApp();
    if (!app.globalData.openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    if (app.globalData.userData && app.globalData.userData.profile) {
      const profile = app.globalData.userData.profile;
      if (profile.nickname && profile.avatar) {
        wx.navigateTo({
          url: '/pages/profile/profile?from=login'
        });
        return;
      }
    }
    
    wx.showModal({
      title: '设置资料',
      content: '设置头像和昵称后，您的投资成果将在排行榜中展示，还可以与好友分享。',
      confirmText: '去设置',
      cancelText: '稍后再说',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({
            url: '/pages/profile/profile?from=login'
          });
        }
      }
    });
  },

  /**
   * 显示分享预览 - 直接使用投资页面的本地数据
   */
  showSharePreview: function() {
    const app = getApp()
    if (!app.globalData.openid || !app.globalData.userData) {
      wx.showToast({
        title: '请先登录查看数据',
        icon: 'none'
      })
      return
    }

    // **优化：优先使用全局变量中预保存的数据**
    if (app.globalData.currentFundPageData) {

      this.setData({
        showGameResult: true,
        gameEndData: app.globalData.currentFundPageData
      })
      return
    }

    // 如果已有投资页面传递的数据，直接使用
    if (this.data.gameEndData) {

      this.setData({
        showGameResult: true
      })
      return
    }

    // 兜底：直接从投资页面获取本地数据
    try {
      const gameEndData = this.getGameDataFromFundPage()
      if (gameEndData) {

        this.setData({
          showGameResult: true,
          gameEndData: gameEndData
        })
      } else {
        wx.showToast({
          title: '暂无投资数据',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('获取投资页面数据失败:', error)
      wx.showToast({
        title: '数据获取失败',
        icon: 'none'
      })
    }
  },

  /**
   * 从投资页面获取本地数据
   */
  getGameDataFromFundPage: function() {
    // 尝试获取投资页面的实例
    const pages = getCurrentPages()
    let fundPage = null
    
    // 查找投资页面实例
    for (let i = pages.length - 1; i >= 0; i--) {
      if (pages[i].route === 'pages/fund/fund') {
        fundPage = pages[i]
        break
      }
    }
    
    // 如果找不到投资页面，尝试通过全局数据获取
    if (!fundPage) {
      const app = getApp()
      if (app.globalData.currentFundPageData) {

        return app.globalData.currentFundPageData
      }
      return null
    }
    
    // 直接从投资页面获取本地数据
    const fundPageData = fundPage.data
    const { _rawData, tradingHistory, currentIndex } = fundPageData
    
    if (!_rawData) {
      return null
    }
    
    const { totalAssets, totalProfit, profitRate, totalProfitRate } = _rawData
    

    
    // 计算交易次数
    const tradingCount = tradingHistory ? tradingHistory.length : 0
    
    // 计算成就等级
    const achievement = this.calculateAchievement(profitRate, tradingCount)
    
    // 计算累计投资天数
    const GAME_CONFIG = require('../../config/gameConfig')
    const cumulativeInvestmentDays = currentIndex - GAME_CONFIG.INITIAL_INDEX
    
    // 格式化数据（与投资页面保持一致）
    const formatNumber = (value, decimals = 2) => {
      const num = parseFloat(value)
      return isNaN(num) ? '0.00' : num.toFixed(decimals)
    }
    
    // 构建游戏数据（直接使用投资页面的本地数据，不进行计算）
    return {
      // 总资产（突出显示）
      finaltotalAssets: formatNumber(totalAssets, 2),
      // 累计收益率（在总资产旁边小字体显示）
      finalTotalProfitRate: formatNumber(totalProfitRate, 2),
      // 持仓收益（使用实际的持仓收益）
      currentRoundProfit: formatNumber(totalProfit, 2),
      // 持仓收益率（使用实际的持仓收益率）
      currentRoundProfitRate: formatNumber(profitRate, 2),
      // 交易次数
      tradingCount: tradingCount,
      // 投资天数
      investmentDays: cumulativeInvestmentDays,
      // 成就信息
      achievementLevel: achievement.level,
      achievementIcon: achievement.icon,
      achievementTitle: achievement.title,
      achievementDesc: achievement.desc
    }
  },

  /**
   * 计算成就等级
   */
  calculateAchievement: function(profitRate, tradingCount) {
    if (profitRate >= 50) {
      return {
        level: 'master',
        icon: '👑',
        title: '投资大师',
        desc: '惊人的投资表现！您已达到大师级水平！'
      }
    } else if (profitRate >= 20) {
      return {
        level: 'expert',
        icon: '💎',
        title: '投资专家',
        desc: '优秀的投资技巧！您的表现令人印象深刻！'
      }
    } else if (profitRate >= 5) {
      return {
        level: 'advanced',
        icon: '⭐',
        title: '进阶投资者',
        desc: '不错的投资收益！继续保持这种势头！'
      }
    } else {
      return {
        level: 'beginner',
        icon: '🌱',
        title: '投资新手',
        desc: '投资是一门学问，继续努力提升投资技巧！'
      }
    }
  },

  /**
   * 头像加载成功事件
   */
  onAvatarLoad: function() {
    // 头像加载成功，无需特殊处理
  },

  /**
   * 头像加载失败事件
   */
  onAvatarError: function(e) {
    console.error('头像加载失败:', e.detail);
    this.setData({
      userInfo: null
    });
  },

  /**
   * 恢复会话状态
   */
  restoreSessionState: function() {
    const app = getApp();
    if (app.globalData.hasStartedInvestmentSession) {
      this.setData({
        hasStartedSession: true
      });
    }
  }
}) 