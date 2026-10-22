import { lazy, Suspense, useEffect, useRef } from 'react'
import { AnimatePresence } from 'motion/react'
import { useMotionPreference } from './motion/useMotionPreference'
import { assembly, decode, hex } from './core/isa'
import { ProgramPanel } from './components/ProgramPanel'
import { RegisterPanel } from './components/RegisterPanel'
import { MemoryPanel } from './components/MemoryPanel'
import { TracePanel } from './components/TracePanel'
import { useLabView } from './stores/useLabStore'
import { ScenePresence } from './components/ScenePresence'
import { usePlaybackDriver } from './motion/usePlaybackDriver'
import { MOTION } from './motion/design'
import { WorkbenchLayout } from './components/WorkbenchLayout'
import { JellyRadio } from './components/react-bits/JellyRadio'

const CpuScene = lazy(() => import('./scenes/CpuScene'))
const GradientASCII = lazy(() => import('./components/react-bits/GradientASCII'))
const MODES = [{ value: 'demo' as const, label: '演示模式' }, { value: 'pro' as const, label: '专业模式' }]

export default function App() {
  const { cpu, program, scene, mode, setMode, enter, home, step, run, pause, reset, resetView, running, playing, trace, phase } = useLabView()
  const reduced = useMotionPreference()
  const anchorRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const homeButtonRef = useRef<HTMLButtonElement>(null)
  const previousScene = useRef(scene)
  usePlaybackDriver(reduced)
  useEffect(() => {
    if (previousScene.current !== scene) {
      (scene === 'workbench' ? headingRef.current : homeButtonRef.current)?.focus({ preventScroll: true })
      previousScene.current = scene
    }
  }, [scene])
  const open = scene === 'workbench'
  const current = program[cpu.pc / 4]
  const status = playing ? '正在讲解' : running ? '运行中' : cpu.status === 'halted' ? '程序完成' : cpu.status === 'fault' ? '执行停止' : '就绪'
  return <div className={`app ${open ? 'is-workbench' : 'is-home'}`}>
    {!open && <Suspense fallback={null}><GradientASCII /></Suspense>}
    <div className="persistent-scene"><Suspense fallback={<div className="scene-fallback">正在加载三维引擎…</div>}><CpuScene anchorRef={anchorRef} /></Suspense></div>
    <header className="app-header">
      <button className="brand" onClick={home} aria-label="芯生首页"><span className="brand-mark">芯</span><span>芯生<span className="brand-en">SILICON LIFE</span></span></button>
      <nav aria-label="主导航"><button className={!open ? 'current' : ''} onClick={home}>探索芯片</button><button className={open ? 'current' : ''} onClick={enter}>CPU 工作台</button></nav>
      <div className="header-meta"><span className="tiny-dot" />RV32I<span className="header-divider" />单周期架构</div>
    </header>

    <main>
      <AnimatePresence>{!open && <ScenePresence key="home" as="section" className="home-copy"><span className="intro-label">SWUST-OC · 交互式 CPU 实验室</span><h1>一条指令，<br />看见芯片的思考。</h1><p>从一颗芯片，走进真实的数据通路。<br />让每一次运算，都变得清晰可见。</p><button ref={homeButtonRef} className="button primary enter-button" onClick={enter}>进入芯片 <span aria-hidden="true">↗</span></button><span className="home-hint">也可以点击芯片开始探索</span></ScenePresence>}</AnimatePresence>

      <AnimatePresence>{open && <ScenePresence key="heading" className="workspace-heading" delay={MOTION.ui.stagger}><div><div className="breadcrumb">芯生 / 实验室 / <span>单周期 CPU</span></div><h1 ref={headingRef} tabIndex={-1}>让指令，走一遍。</h1></div><JellyRadio items={MODES} value={mode} onChange={setMode} ariaLabel="工作台模式" /></ScenePresence>}</AnimatePresence>

      <WorkbenchLayout open={open} program={<AnimatePresence>{open && <ScenePresence key="program" id="program-region" label="程序与指令编辑" as="aside" className="program-panel panel-scroll" delay={MOTION.ui.stagger * 2}>
          <ProgramPanel />
        </ScenePresence>}</AnimatePresence>} scene={<>
          <AnimatePresence>{open && <ScenePresence key="toolbar" className="scene-toolbar" delay={MOTION.ui.stagger * 3}><span><span className="tiny-dot" />Teaching plane <small>2.5D</small></span><button className="text-button" onClick={resetView}>↺ 恢复视角</button></ScenePresence>}</AnimatePresence>
          <div ref={anchorRef} className="scene-viewport" data-testid="scene-anchor" aria-label={open ? 'CPU 三维交互区域' : '芯片三维交互区域'} />
          <div className="scene-bottom"><span>拖拽旋转 <span className="separator">·</span> 滚轮缩放 <span className="separator">·</span> 右键平移</span>{open && <span className="scene-legend" aria-label="信号语义图例"><i />数据<i className="control" />控制<i className="writeback" />写回</span>}</div>
          </>} details={<><AnimatePresence>{open && <ScenePresence key="controls" className="execution-presence" delay={MOTION.ui.stagger * 3}>
            <div className="execution-bar"><div className="pc-state"><span>PC</span><code data-testid="pc">{hex(cpu.pc)}</code><small>已提交 {cpu.retired} 条</small></div><div className="execution-controls"><button className="button icon-button" aria-label="复位 CPU" title="复位 CPU" onClick={reset}>↺</button><button className="button subtle" onClick={step} disabled={playing || running || cpu.status !== 'ready'}>单步指令</button>{playing || running ? <button className="button primary" aria-label="暂停" onClick={pause}><span aria-hidden="true">Ⅱ</span> 暂停</button> : <button className="button primary" aria-label="运行" onClick={run} disabled={cpu.status !== 'ready' && !(trace?.after === cpu && phase !== 'writeback')}><span aria-hidden="true">▷</span> 运行</button>}</div></div>
            <div className="execution-status" role="status"><span className={`status-dot ${cpu.status === 'fault' ? 'fault' : ''}`} />{status}<span className="status-detail">{cpu.reason ?? (current !== undefined ? `下一条：${assembly(decode(current))}` : '')}</span></div>
          </ScenePresence>}</AnimatePresence>
          <AnimatePresence>{open && <ScenePresence key="trace" className="trace-presence" delay={MOTION.ui.stagger * 4}><TracePanel /></ScenePresence>}</AnimatePresence></>}
        state={<AnimatePresence>{open && <ScenePresence key="state" id="state-region" label="寄存器与数据内存" as="aside" className="state-panel panel-scroll" delay={MOTION.ui.stagger * 3}><RegisterPanel /><MemoryPanel /></ScenePresence>}</AnimatePresence>} />
    </main>

    <footer className="app-footer"><span>SWUST-OC 一生一芯学习小组</span><span>{open ? '真实执行 · 快照驱动可视化' : 'Cinematic Reveal + Teaching Plane'}</span><span>Sprint 03 <span className="separator">/</span> 2026</span></footer>
  </div>
}
