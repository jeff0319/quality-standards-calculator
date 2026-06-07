# 用 95% 抽样接受概率判断“至少 93.5% 不超过声明值”的数学依据

> 本文讨论一种一般性的声明值验证思想：声明值不是只约束样本均值，而是约束批量总体中不超过某个上限的比例；抽样规则也不是直接证明该总体命题为真，而是在给定统计模型下设计一个具有规定操作特性（operating characteristic, OC）的接受规则。IEC 噪声声明只是这种思想的一个特例。

## 1. 问题的精确定义

设批量产品某一性能指标为随机变量

```math
X\sim F_\theta
```

数值越小越好。产品给出的声明值为

```math
L_c
```

我们关心的总体命题是：

```math
C_q(L_c):\quad P_\theta(X\le L_c)\ge q
```

其中本文主要讨论

```math
q=0.935
```

也就是说，声明值要覆盖至少 93.5% 的批量总体。等价地，超过声明值的不合格比例不超过

```math
p=1-q=0.065
```

现在只抽取

```math
X_1,\ldots,X_n
```

无法直接观察整个总体，因此必须定义一个抽样接受规则

```math
\varphi(X_1,\ldots,X_n;L_c)\in\{0,1\}
```

其中 `1` 表示接受该声明，`0` 表示不接受该声明。

所谓“用 95% 的抽样接受概率，去判断这个批量产品至少有 93.5% 不超过声明值”，严密地说应写成：

```math
P_\theta\{\varphi=1\}=0.95
\quad\text{when}\quad
P_\theta(X\le L_c)=0.935
```

这句话定义的是抽样方案在“边界可接受质量水平”处的接受概率。它不是说：

```math
P\{C_q(L_c)\mid \varphi=1\}=0.95
```

后者是验后概率或贝叶斯概率，必须额外指定先验分布；在经典频率学派抽样验收中，通常不这样解释。

因此，本文的核心结论先说清楚：

> 95% 是抽样方案的操作特性；93.5% 是被声明值覆盖的总体比例。二者可以严密结合，但结合方式是“校准接受规则的长期抽样概率”，而不是“抽检通过后总体命题有 95% 概率为真”。

## 2. 双重概率的统计含义

这类问题天然有两层概率。

第一层是总体覆盖率：

```math
P_\theta(X\le L_c)\ge q
```

它描述产品总体本身。若从该批量总体中随机抽一台，指标不超过声明值的概率至少为 `q`。

第二层是抽样接受概率：

```math
P_\theta\{\varphi(X_1,\ldots,X_n;L_c)=1\}
```

它描述抽样方案。即使总体参数固定，样本仍然随机；同一个批量在重复抽样时，有时会被接受，有时会被拒绝。

把两层合在一起，最常见的工程设计要求是：

```math
P_\theta\{\varphi=1\}\ge 1-\alpha
\quad\text{for every }\theta\text{ such that }P_\theta(X\le L_c)\ge q
```

如果接受概率随产品变差而单调下降，那么只需在边界

```math
P_\theta(X\le L_c)=q
```

处校准：

```math
P_{\theta_q}\{\varphi=1\}=1-\alpha
```

其中

```math
1-\alpha=0.95
```

这就是“95% 接受概率 / 93.5% 总体覆盖率”的严格含义。

在抽样验收语言中，`q=93.5%` 可以看作可接受质量水平，`alpha=5%` 是生产者风险：一个刚好达到可接受质量水平的批次，仍有 5% 概率因抽样波动被拒绝。

## 3. 正态且标准差已知时的完整推导

下面给出最透明的数学推导。设

```math
X\sim N(\mu,\sigma^2)
```

且 `sigma` 已知或由标准预先规定。若声明值 `L_c` 至少覆盖 `q` 的总体，则

```math
P(X\le L_c)=\Phi\left(\frac{L_c-\mu}{\sigma}\right)\ge q
```

其中 `Phi` 是标准正态分布函数。令

```math
z_q=\Phi^{-1}(q)
```

则总体命题等价于

```math
\frac{L_c-\mu}{\sigma}\ge z_q
```

也就是

```math
\mu\le L_c-z_q\sigma
```

边界可接受总体满足

```math
\mu_q=L_c-z_q\sigma
```

现在设抽样规则采用样本均值：

```math
\bar X=\frac{1}{n}\sum_{i=1}^{n}X_i
```

并规定：

```math
\varphi=1
\quad\Longleftrightarrow\quad
\bar X\le L_c-k\sigma
```

其中 `k` 是待定常数。由于

```math
\bar X\sim N\left(\mu,\frac{\sigma^2}{n}\right)
```

在边界总体 `mu=mu_q` 下，接受概率为

```math
P_{\mu_q}\{\varphi=1\}
=P_{\mu_q}\{\bar X\le L_c-k\sigma\}
```

代入

```math
L_c=\mu_q+z_q\sigma
```

得到

```math
P_{\mu_q}\{\varphi=1\}
=P\left\{
\bar X\le \mu_q+(z_q-k)\sigma
\right\}
```

标准化：

```math
P_{\mu_q}\{\varphi=1\}
=
\Phi\left((z_q-k)\sqrt n\right)
```

要求边界总体的接受概率为 `1-alpha`：

```math
\Phi\left((z_q-k)\sqrt n\right)=1-\alpha
```

因此

```math
(z_q-k)\sqrt n=z_{1-\alpha}
```

最终得到

```math
k=z_q-\frac{z_{1-\alpha}}{\sqrt n}
```

这就是小样本均值接受规则中 `k` 的来源。

## 4. 93.5% 与 95% 的数值结果

当

```math
q=0.935,\quad 1-\alpha=0.95,\quad n=3
```

有

```math
z_q=\Phi^{-1}(0.935)\approx1.514
```

```math
z_{1-\alpha}=\Phi^{-1}(0.95)\approx1.645
```

所以

```math
k
=1.514-\frac{1.645}{\sqrt3}
\approx 1.514-0.950
\approx0.564
```

于是接受规则为

```math
\bar X\le L_c-0.564\sigma
```

若在 IEC 噪声场景中把标准给定的参考标准差记为 `sigma_M`，则写成

```math
\bar X\le L_c-0.564\sigma_M
```

这个 `0.564` 不是经验修正，而是由以下三个设计输入唯一决定：

```math
q=93.5\%,\qquad 1-\alpha=95\%,\qquad n=3
```

## 5. 操作特性曲线：这个规则到底保证什么

对任意真实均值 `mu`，接受概率为

```math
P_\mu\{\varphi=1\}
=
\Phi\left(
\frac{L_c-k\sigma-\mu}{\sigma/\sqrt n}
\right)
```

把真实总体覆盖率

```math
r=P_\mu(X\le L_c)
```

写成

```math
r=\Phi\left(\frac{L_c-\mu}{\sigma}\right)
```

则

```math
\frac{L_c-\mu}{\sigma}=\Phi^{-1}(r)
```

因此接受概率可以直接写成覆盖率 `r` 的函数：

```math
P\{\varphi=1\mid r\}
=
\Phi\left(
\sqrt n\{\Phi^{-1}(r)-k\}
\right)
```

代入

```math
k=z_q-\frac{z_{1-\alpha}}{\sqrt n}
```

可得

```math
P\{\varphi=1\mid r\}
=
\Phi\left(
\sqrt n\{\Phi^{-1}(r)-z_q\}+z_{1-\alpha}
\right)
```

于是当

```math
r=q
```

时，

```math
P\{\varphi=1\mid r=q\}=1-\alpha
```

并且由于 `Phi^{-1}(r)` 随 `r` 单调递增，接受概率随总体质量 `r` 单调递增。也就是说：

- 如果真实覆盖率高于 93.5%，接受概率高于 95%；
- 如果真实覆盖率刚好等于 93.5%，接受概率等于 95%；
- 如果真实覆盖率低于 93.5%，接受概率低于 95%，但不一定很低。

最后一点很重要。只控制生产者风险并不等于同时控制消费者风险。若希望保证“坏到某个程度的批次被接受概率不超过 beta”，还必须另外指定拒收质量水平 `q_1<q`，并要求：

```math
P\{\varphi=1\mid r=q_1\}\le\beta
```

这就是完整抽样验收方案中的双点设计：一个点保护好批次，一个点限制坏批次。

## 6. 为什么这不同于“抽检通过后有 95% 把握”

容易混淆的说法是：

> 抽检通过，所以有 95% 概率该批至少 93.5% 不超过声明值。

在经典频率学派下，这句话并不成立。总体参数 `theta` 固定，命题

```math
C_q(L_c): P_\theta(X\le L_c)\ge q
```

本身不是随机事件；随机的是样本和由样本导出的接受/拒绝决定。

正确的频率学派说法是：

> 如果某批量真实处于 93.5% 覆盖率的边界水平，并无限次重复同样的随机抽样，则该规则约有 95% 的重复抽样会接受它。

如果希望说“抽检通过后，有 95% 置信该批满足至少 93.5%”，更接近统计容许区间的语言。那时通常构造一个样本函数 `U(X_1,\ldots,X_m)`，使得

```math
P_\theta\{F_\theta(U)\ge q\}\ge 1-\alpha
```

然后若观察到

```math
U\le L_c
```

才说样本给出了一个 `1-alpha` 置信水平、`q` 覆盖率的单侧容许结论。

注意方向不同：

- 抽样验收规则常校准为“好批次在边界处以 95% 概率被接受”；
- 统计容许区间常校准为“构造出的上容许限以 95% 概率覆盖总体第 `q` 分位数”。

两者都使用 `95%` 和 `q`，但风险含义不同。

## 7. 与统计容许区间的关系

统计容许区间（statistical tolerance interval）正是研究“用样本对总体比例作带置信水平的陈述”的经典工具。典型定义为：

```math
P_\theta\{P_\theta(X\le U)\ge q\}\ge 1-\alpha
```

这里 `U` 是由样本计算出的单侧上容许限。它回答的问题是：

> 这个样本给出的上限 `U`，是否以 `1-alpha` 的长期置信水平覆盖至少 `q` 的总体？

若正态分布且标准差未知，常见形式是

```math
U=\bar X+K_{\text{tol}}S
```

其中 `S` 是样本标准差，`K_tol` 由非中心 t 分布、近似公式或数值方法确定。这个 `K_tol` 与前面抽样验收规则里的 `k` 不是同一个常数。

如果标准差已知，则单侧上容许限可写为

```math
U=\bar X+\left(z_q+\frac{z_{1-\alpha}}{\sqrt n}\right)\sigma
```

这是因为在边界

```math
\xi_q=\mu+z_q\sigma
```

要满足

```math
P(U\ge \xi_q)=1-\alpha
```

因此

```math
P\left(
\bar X+
\left(z_q+\frac{z_{1-\alpha}}{\sqrt n}\right)\sigma
\ge
\mu+z_q\sigma
\right)
=1-\alpha
```

这个系数是

```math
z_q+\frac{z_{1-\alpha}}{\sqrt n}
```

而抽样验收边界接受规则中的系数是

```math
z_q-\frac{z_{1-\alpha}}{\sqrt n}
```

二者一加一减，恰好说明二者回答的问题不是同一个。

## 8. 声明值如何反向设计

前面讨论的是给定 `L_c` 后如何抽样验证。制造商在设定声明值时，通常还会反向考虑未来抽检通过概率。

设未来验证样本均值满足

```math
\bar X_v\sim N\left(\mu,\frac{\sigma_t^2}{n}\right)
```

其中 `sigma_t` 是未来生产和测量共同造成的总标准差。验证规则为

```math
\bar X_v\le L_c-k\sigma_M
```

若希望未来抽检接受概率达到 `P_a`，则要求

```math
P\{\bar X_v\le L_c-k\sigma_M\}=P_a
```

标准化：

```math
\Phi\left(
\frac{L_c-k\sigma_M-\mu}{\sigma_t/\sqrt n}
\right)=P_a
```

因此

```math
L_c
=
\mu+k\sigma_M+\frac{z_{P_a}}{\sqrt n}\sigma_t
```

若写成

```math
L_c=\mu+K
```

则声明裕量为

```math
K=k\sigma_M+\frac{z_{P_a}}{\sqrt n}\sigma_t
```

这说明大 `K` 是为通过未来抽检而设置的声明裕量，小 `k` 是抽检接受规则中的扣减量。二者相关，但处在不同位置：

```math
\text{声明：}\quad L_c=\mu+K
```

```math
\text{验证：}\quad \bar X_v\le L_c-k\sigma_M
```

## 9. 属性抽样中的同构形式

若只记录每台是否超过声明值，定义

```math
Y_i=1\{X_i>L_c\}
```

则

```math
Y_i\sim \text{Bernoulli}(p)
```

其中

```math
p=P(X>L_c)
```

总体命题“至少 93.5% 不超过声明值”等价于

```math
p\le0.065
```

若抽 `n` 台，允许最多 `c` 台超过声明值，则接受概率为

```math
P_a(p)
=
P\left(\sum_{i=1}^{n}Y_i\le c\right)
=
\sum_{j=0}^{c}{n\choose j}p^j(1-p)^{n-j}
```

设计要求可以写为

```math
P_a(0.065)\ge0.95
```

这也是同样的双重概率结构：`0.065` 是总体不合格比例，`0.95` 是抽样方案在该质量水平处的接受概率。

计量抽样使用实际测量值 `X_i`，比只记录合格/不合格的属性抽样保留了更多信息，因此在正态等模型成立时，通常能用更小样本达到类似的风险控制。

## 10. 非正态、有限批和模型风险

以上正态推导依赖三个关键假设：

1. 抽样独立且代表目标批量；
2. 总体分布可用正态或近似正态描述；
3. 标准差 `sigma` 或 `sigma_M` 的取值可信。

若这些条件不成立，`k=0.564` 的数值结论不再自动成立。

对于非正态分布，可以采用：

- 基于经验分位数或顺序统计量的非参数容许区间；
- Bootstrap 或 Monte Carlo 模拟；
- 对数正态、Weibull、Gamma 等更贴近物理机制的参数模型；
- 明确指定消费者风险点的 OC 曲线设计。

对于有限批量，如果抽样不放回，严格模型应从无限总体近似转为有限总体抽样。属性数据可用超几何分布；计量数据则要结合有限总体修正或直接从批量值集合建模。

因此，双重概率方法本身是严密的；但它的数值常数只在相应模型假设下严密。

## 11. 数值核验

下面的 Python 代码验证 `q=0.935`、`alpha=0.05`、`n=3` 时的 `k` 与边界接受概率。

```python
from statistics import NormalDist
import math


def small_k(q=0.935, alpha=0.05, n=3):
    nd = NormalDist()
    return nd.inv_cdf(q) - nd.inv_cdf(1 - alpha) / math.sqrt(n)


def acceptance_probability(r, k, n=3):
    nd = NormalDist()
    return nd.cdf(math.sqrt(n) * (nd.inv_cdf(r) - k))


q = 0.935
alpha = 0.05
n = 3

k = small_k(q=q, alpha=alpha, n=n)
pa_at_boundary = acceptance_probability(q, k, n=n)

print(f"k = {k:.6f}")
print(f"P_accept at r=q = {pa_at_boundary:.6f}")
```

输出应接近：

```text
k = 0.564445
P_accept at r=q = 0.950000
```

## 12. 文献和标准线索

这类“双重概率”并不是 IEC 特有思想，至少可以在以下几条文献脉络中找到同类论述。

1. **统计容许区间**

   ISO 16269-6 的主题就是 statistical tolerance intervals，其范围描述为：建立能够以指定置信水平包含总体指定比例的容许区间，并同时给出单侧和双侧情形。参见 [ISO 16269-6:2005 条目](https://standards.iteh.ai/catalog/standards/iso/2f1b2ac5-4dc1-441b-a9fb-96c1de0cba04/iso-16269-6-2005)。

2. **NIST / NBS 正态容许区间资料**

   NIST 有早期报告 *Confidence and tolerance intervals for the normal distribution*，专门讨论正态总体的置信区间与容许区间。参见 [NIST publication page](https://www.nist.gov/publications/confidence-and-tolerance-intervals-normal-distribution)。

3. **现代统计软件中的容许区间**

   Minitab 的方法说明把容许区间写成 `(1-alpha, P)` 形式，其中 `P` 是目标总体覆盖率，`1-alpha` 是置信水平；同时给出单侧容许界的定义和与分位数置信界的关系。参见 [Minitab: Tolerance Intervals, Normal Distribution](https://support.minitab.com/en-us/minitab/help-and-how-to/quality-and-process-improvement/quality-tools/how-to/tolerance-intervals-normal-distribution/methods-and-formulas/methods-and-formulas/)。

4. **容许区间的稳健性和模型错设**

   Francq、Berger 和 Boachie 讨论了置信区间、预测区间、容许区间的区别，并给出单侧容许区间满足的概率定义；文章还强调模型错设会影响容许区间性能。参见 [Tolerance intervals in statistical software and robustness under model misspecification](https://link.springer.com/article/10.1186/s40488-021-00123-2)。

5. **抽样验收中的生产者风险和消费者风险**

   抽样验收文献通常用 AQL、RQL/LTPD、生产者风险 `alpha`、消费者风险 `beta` 描述抽样方案的 OC 曲线。Minitab 对生产者风险的说明与本文“边界好批次有 95% 接受概率”的解释一致：`1-alpha` 是在 AQL 处接受批次的期望概率。参见 [Minitab: Attributes Acceptance Sampling](https://support.minitab.com/en-us/minitab/help-and-how-to/quality-and-process-improvement/acceptance-sampling/how-to/attributes-acceptance-sampling/interpret-the-results/all-statistics-and-graphs/)。

6. **非参数容许区间和顺序统计量**

   NIST/SEMATECH e-Handbook 对基于最大、最小观测值的容许区间给出样本量与覆盖率、置信水平之间的关系，体现了“不依赖正态模型也能设计双重概率保证”的思路。参见 [NIST: Tolerance intervals based on largest and smallest observations](https://www.itl.nist.gov/div898/handbook/prc/section2/prc264.htm)。

这些文献共同说明：用一个概率描述总体覆盖率、另一个概率描述抽样程序的可靠性，是成熟的统计框架。IEC 场景中的 93.5% / 95% 只是该框架在某个产品声明制度中的特定参数选择。

## 13. 结论

“用 95% 的抽样接受概率，去判断这个批量产品至少有 93.5% 不超过声明值”这件事可以成立，但必须按下面的方式理解：

```math
P_\theta\{\text{抽样接受}\}=0.95
\quad\text{在}\quad
P_\theta(X\le L_c)=0.935
\quad\text{的边界总体上}
```

在正态且标准差已知的模型下，如果使用样本均值接受规则

```math
\bar X\le L_c-k\sigma
```

则严格推导给出

```math
k=\Phi^{-1}(0.935)-\frac{\Phi^{-1}(0.95)}{\sqrt n}
```

当 `n=3` 时，

```math
k\approx0.564
```

它的统计含义是：刚好有 93.5% 产品不超过声明值的批量，在重复抽取 3 台并按该规则判断时，有 95% 的长期概率被接受。

更短地说：

> 93.5% 是总体质量命题；95% 是抽样规则在边界质量水平处的接受概率。严密性来自 OC 曲线或容许区间理论，而不是来自对某一次抽检结果的直觉解释。
